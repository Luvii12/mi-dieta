-- Esquema de la app «Mi dieta» en Supabase (fase M0, docs/PLAN_MULTIUSUARIO.md).
-- Se ejecuta entero en el editor SQL del panel de Supabase. Se puede volver a ejecutar: no borra datos.
--
-- Las tablas y columnas son las de las pestañas de Google Sheets (docs/DATOS.md), así el motor cambia poco:
--   · Comunes (todos los usuarios con sesión): alimentos, recetas.
--   · Personales (cada fila lleva user_id y solo la ve su dueño): perfiles, config, valoraciones,
--     preferencias, planes, plan_comidas, pesos, ajustes_historial.
-- La seguridad la ponen las reglas por fila (RLS): la clave pública de la PWA no da acceso a nada sin sesión.
-- Desde 2026 Supabase no da permisos automáticos a las tablas nuevas: por eso cada tabla lleva su `grant`.

-- ---------------------------------------------------------------------------------------------------
-- Administradores: pueden editar y borrar alimentos y recetas de todos. Se añaden a mano desde el editor
-- SQL (ver docs/SUPABASE.md); desde la app nadie puede hacerse administrador.
create table if not exists public.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.administradores enable row level security;
revoke all on public.administradores from anon, authenticated;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()));
$$;
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Comunes

create table if not exists public.alimentos (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre text,
  grupo text not null check (grupo in ('proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta', 'verdura_condimento')),
  kcal_100 numeric not null check (kcal_100 >= 0),
  proteina_100 numeric not null check (proteina_100 >= 0),
  carbohidratos_100 numeric not null check (carbohidratos_100 >= 0),
  grasa_100 numeric not null check (grasa_100 >= 0),
  gramos_por_unidad numeric check (gramos_por_unidad > 0),
  estado text not null check (estado in ('crudo', 'cocinado')),
  fuente text,
  verificado text not null default 'no' check (verificado in ('si', 'no')),
  codigo_barras text,
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado timestamptz not null default now()
);

create table if not exists public.recetas (
  id text primary key,
  comida text not null check (comida in ('Desayuno', 'Almuerzo', 'Merienda', 'Cena')),
  nombre text not null,
  preparacion text,
  ingredientes_fijos jsonb not null default '[]',
  ingredientes_escalables jsonb not null default '[]',
  origen text not null default 'manual' check (origen in ('semilla', 'ia', 'manual')),
  activa text not null default 'si' check (activa in ('si', 'no', 'propuesta', 'descartada')),
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------
-- Personales

-- Datos para calcular los objetivos (fase M4). Los objetivos en sí van en `config`, como ahora.
create table if not exists public.perfiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nombre text,
  sexo text check (sexo in ('hombre', 'mujer')),
  nacimiento date,
  altura_cm numeric check (altura_cm between 100 and 250),
  actividad text check (actividad in ('sedentaria', 'ligera', 'moderada', 'alta', 'muy_alta')),
  meta text check (meta in ('perder', 'mantener', 'ganar')),
  creado timestamptz not null default now()
);

-- Clave / valor (JSON) por usuario: objetivo_desayuno, tolerancias, comida_libre_semanal, peso_objetivo…
create table if not exists public.config (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  clave text not null,
  valor jsonb,
  primary key (user_id, clave)
);

-- Historial: cada valoración es una fila nueva; manda la última de cada receta.
create table if not exists public.valoraciones (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  receta_id text not null references public.recetas (id) on delete cascade,
  valor text not null check (valor in ('me_encanta', 'normal', 'no_repetir')),
  fecha date not null default current_date
);
create index if not exists valoraciones_usuario on public.valoraciones (user_id, receta_id);

create table if not exists public.preferencias (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('excluido', 'alergia', 'favorito')),
  alimento_id text not null,
  nota text,
  unique (user_id, tipo, alimento_id)
);

create table if not exists public.planes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id text not null,
  inicio date not null,
  fin date not null,
  estado text not null check (estado in ('borrador', 'siguiente', 'activo', 'archivado')),
  objetivos jsonb,
  creado timestamptz not null default now(),
  primary key (user_id, plan_id),
  check (fin >= inicio)
);

create table if not exists public.plan_comidas (
  user_id uuid not null default auth.uid(),
  plan_id text not null,
  fecha date not null,
  comida text not null check (comida in ('Desayuno', 'Almuerzo', 'Merienda', 'Cena')),
  receta_id text not null,
  gramos jsonb not null default '{}',
  kcal numeric,
  "P" numeric,
  "C" numeric,
  "G" numeric,
  hecha text not null default 'no',
  cambiada_por text,
  fijados jsonb,
  primary key (user_id, plan_id, fecha, comida),
  foreign key (user_id, plan_id) references public.planes (user_id, plan_id) on delete cascade
);

-- Estados de una comida. Va aparte para que, al volver a ejecutar el esquema, se actualice en tablas que ya
-- existen ('saltada': marcada como no hecha, desde 2026-10-19).
alter table public.plan_comidas drop constraint if exists plan_comidas_hecha_check;
alter table public.plan_comidas add constraint plan_comidas_hecha_check check (hecha in ('si', 'no', 'libre', 'saltada'));
-- Gramos que ha elegido la persona en esa comida ({"alimento": g}; el resto lo cuadra el optimizador). 2026-10-20.
alter table public.plan_comidas add column if not exists fijados jsonb;

create table if not exists public.pesos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  peso_kg numeric not null check (peso_kg between 25 and 300),
  cintura_cm numeric,
  primary key (user_id, fecha)
);

create table if not exists public.ajustes_historial (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null default current_date,
  plan_id text,
  ritmo_semanal_pct numeric,
  adherencia_pct numeric,
  propuesta_kcal numeric,
  aceptada text check (aceptada in ('si', 'no'))
);

-- ---------------------------------------------------------------------------------------------------
-- Reglas por fila (RLS) y permisos

-- Comunes: las leen todos los usuarios con sesión y cualquiera puede añadir; cambiar o borrar, solo quien
-- la creó o un administrador.
do $$
declare t text;
begin
  foreach t in array array['alimentos', 'recetas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists leer on public.%I', t);
    execute format('drop policy if exists anadir on public.%I', t);
    execute format('drop policy if exists cambiar on public.%I', t);
    execute format('drop policy if exists borrar on public.%I', t);
    execute format('create policy leer on public.%I for select to authenticated using (true)', t);
    execute format('create policy anadir on public.%I for insert to authenticated with check (creado_por = (select auth.uid()))', t);
    execute format('create policy cambiar on public.%I for update to authenticated using (creado_por = (select auth.uid()) or (select public.es_admin())) with check (creado_por = (select auth.uid()) or (select public.es_admin()))', t);
    execute format('create policy borrar on public.%I for delete to authenticated using (creado_por = (select auth.uid()) or (select public.es_admin()))', t);
  end loop;
end $$;

-- Personales: cada usuario solo ve, añade, cambia y borra sus filas.
do $$
declare t text;
begin
  foreach t in array array['perfiles', 'config', 'valoraciones', 'preferencias', 'planes', 'plan_comidas',
                           'pesos', 'ajustes_historial'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists propias on public.%I', t);
    execute format('create policy propias on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Registro con código de invitación (2026-11-11). El registro de Auth está abierto, pero esta función
-- (Authentication › Hooks › Before User Created) no deja crear una cuenta sin un código activo de
-- `invitaciones`: el código lo escribe la persona en «Crear cuenta» y llega en user_metadata.codigo.
-- Las cuentas que crean los scripts con la clave secreta (npm run invitar, cuentas temporales de las pruebas)
-- llevan app_metadata.alta = 'script', que nadie puede ponerse al registrarse, y pasan sin código.
-- Los códigos se ven, añaden y desactivan desde el editor SQL (docs/SUPABASE.md §12); la app no puede leerlos.
create table if not exists public.invitaciones (
  codigo text primary key check (codigo = upper(btrim(codigo)) and codigo <> ''),
  activo boolean not null default true,
  nota text,
  creado timestamptz not null default now()
);
alter table public.invitaciones enable row level security;
revoke all on public.invitaciones from anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on public.invitaciones to supabase_auth_admin;
drop policy if exists leer_al_registrar on public.invitaciones;
create policy leer_al_registrar on public.invitaciones for select to supabase_auth_admin using (true);

create or replace function public.antes_de_crear_usuario(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_codigo text := upper(btrim(coalesce(event->'user'->'user_metadata'->>'codigo', '')));
begin
  if event->'user'->'app_metadata'->>'alta' = 'script' then
    return '{}'::jsonb;
  end if;
  if v_codigo <> '' and exists (select 1 from public.invitaciones i where i.codigo = v_codigo and i.activo) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'El código de invitación no es válido. Pídeselo a quien te ha pasado la app.'));
end;
$$;
grant execute on function public.antes_de_crear_usuario(jsonb) to supabase_auth_admin;
revoke execute on function public.antes_de_crear_usuario(jsonb) from authenticated, anon, public;
