--
-- PostgreSQL database dump
--

\restrict AHEAyEZHFt4yCLkDtzYZ12mqEFCQIINfPElPnq6Jdxqa2LeaYpau0N6cMQr8aNX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: actualizar_kilometraje_posoperacional(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_kilometraje_posoperacional() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.vehiculos
  SET
    kilometraje = CASE
      WHEN kilometraje IS NULL THEN NEW.kilometraje_final
      WHEN NEW.kilometraje_final > kilometraje THEN NEW.kilometraje_final
      ELSE kilometraje
    END,
    ultima_actualizacion = NOW()
  WHERE placa = NEW.vehiculo_placa;

  RETURN NEW;
END;
$$;


--
-- Name: actualizar_kilometraje_tanqueo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_kilometraje_tanqueo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.vehiculos
  SET
    kilometraje = CASE
      WHEN kilometraje IS NULL THEN NEW.kilometraje
      WHEN NEW.kilometraje > kilometraje THEN NEW.kilometraje
      ELSE kilometraje
    END,
    ultima_actualizacion = NOW()
  WHERE placa = NEW.vehiculo_placa;

  RETURN NEW;
END;
$$;


--
-- Name: alertas_documentos_activas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alertas_documentos_activas() RETURNS TABLE(placa text, tipo text, documento text, vencimiento date, dias_restantes integer, nivel text)
    LANGUAGE sql
    AS $$
  SELECT * FROM (
    SELECT placa, tipo, 'SOAT' AS documento, soat_vencimiento AS vencimiento,
      (soat_vencimiento - CURRENT_DATE)::integer AS dias_restantes,
      CASE WHEN soat_vencimiento < CURRENT_DATE THEN 'VENCIDO'
           WHEN soat_vencimiento < CURRENT_DATE + 30 THEN 'CRITICO'
           ELSE 'ADVERTENCIA' END AS nivel
    FROM vehiculos WHERE activo = true AND soat_vencimiento < CURRENT_DATE + 60
    UNION ALL
    SELECT placa, tipo, 'TECNOMECANICA', tecnomecanica_vencimiento,
      (tecnomecanica_vencimiento - CURRENT_DATE)::integer,
      CASE WHEN tecnomecanica_vencimiento < CURRENT_DATE THEN 'VENCIDO'
           WHEN tecnomecanica_vencimiento < CURRENT_DATE + 30 THEN 'CRITICO'
           ELSE 'ADVERTENCIA' END
    FROM vehiculos WHERE activo = true AND tecnomecanica_vencimiento < CURRENT_DATE + 60
  ) sub
  ORDER BY dias_restantes ASC;
$$;


--
-- Name: bloquear_vehiculos_vencidos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bloquear_vehiculos_vencidos() RETURNS TABLE(placa text, motivo text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE vehiculos SET
    bloqueado      = true,
    motivo_bloqueo = CASE
      WHEN soat_vencimiento < CURRENT_DATE AND tecnomecanica_vencimiento < CURRENT_DATE
        THEN 'SOAT y tecnomecánica vencidos'
      WHEN soat_vencimiento < CURRENT_DATE
        THEN 'SOAT vencido desde ' || to_char(soat_vencimiento,'DD/MM/YYYY')
      ELSE 'Tecnomecánica vencida desde ' || to_char(tecnomecanica_vencimiento,'DD/MM/YYYY')
      END,
    ultima_actualizacion = now()
  WHERE activo = true AND bloqueado = false
    AND (soat_vencimiento < CURRENT_DATE OR tecnomecanica_vencimiento < CURRENT_DATE)
  RETURNING placa, motivo_bloqueo;
END;
$$;


--
-- Name: calcular_precio_unitario_tanqueo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcular_precio_unitario_tanqueo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.precio_unitario IS NULL AND NEW.cantidad IS NOT NULL AND NEW.cantidad > 0 THEN
    NEW.precio_unitario := ROUND((NEW.valor_total / NEW.cantidad)::numeric, 2);
  END IF;

  IF NEW.diferencia_km IS NULL AND NEW.km_referencia IS NOT NULL AND NEW.kilometraje IS NOT NULL THEN
    NEW.diferencia_km := NEW.kilometraje - NEW.km_referencia;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: limpiar_sesiones_vencidas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limpiar_sesiones_vencidas() RETURNS void
    LANGUAGE sql
    AS $$
  DELETE FROM sesiones_activas WHERE expires_at < now();
$$;


--
-- Name: verificar_pico_placa(text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verificar_pico_placa(p_placa text, p_ciudad text, p_momento timestamp with time zone DEFAULT now()) RETURNS TABLE(tiene_restriccion boolean, nivel text, mensaje_bot text, ciudad text, digito_placa integer, hora_fin_restriccion time without time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_ultimo_digito integer;
  v_dia_semana    integer;
  v_hora_actual   time;
  v_dia_mes       integer;
  v_ciudad        ciudades_pico_placa%ROWTYPE;
  v_digitos       integer[];
  v_exento        boolean;
  v_motivo_ex     text;
BEGIN
  v_ultimo_digito := (RIGHT(p_placa, 1))::integer;
  v_dia_semana    := EXTRACT(ISODOW FROM p_momento)::integer;
  v_hora_actual   := p_momento::time;
  v_dia_mes       := EXTRACT(DAY FROM p_momento)::integer;

  SELECT exento_pico_placa, motivo_exencion INTO v_exento, v_motivo_ex
  FROM vehiculos WHERE placa = p_placa;

  IF v_exento IS TRUE THEN
    RETURN QUERY SELECT false,'EXENTO',
      '✅ Vehículo ' || p_placa || ' exento. Motivo: ' || COALESCE(v_motivo_ex,'no especificado'),
      p_ciudad, v_ultimo_digito, NULL::time;
    RETURN;
  END IF;

  SELECT * INTO v_ciudad FROM ciudades_pico_placa
  WHERE LOWER(ciudad) = LOWER(p_ciudad) AND activo = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false,'SIN_DATOS',
      'ℹ️ Sin datos de pico y placa para ' || p_ciudad || '.',
      p_ciudad, v_ultimo_digito, NULL::time;
    RETURN;
  END IF;

  IF v_ciudad.vigente_hasta IS NOT NULL AND CURRENT_DATE > v_ciudad.vigente_hasta THEN
    RETURN QUERY SELECT false,'DECRETO_VENCIDO',
      '⚠️ Decreto de pico y placa para ' || p_ciudad || ' venció el ' ||
      to_char(v_ciudad.vigente_hasta,'DD/MM/YYYY') || '. Consulta la normativa actualizada.',
      p_ciudad, v_ultimo_digito, NULL::time;
    RETURN;
  END IF;

  IF v_dia_semana = 6 AND NOT v_ciudad.aplica_sabado THEN
    RETURN QUERY SELECT false,'NO_APLICA',
      '✅ Sábado — sin pico y placa en ' || p_ciudad || '.',
      p_ciudad, v_ultimo_digito, NULL::time;
    RETURN;
  END IF;

  IF v_dia_semana = 7 AND NOT v_ciudad.aplica_domingo THEN
    RETURN QUERY SELECT false,'NO_APLICA',
      '✅ Domingo — sin pico y placa en ' || p_ciudad || '.',
      p_ciudad, v_ultimo_digito, NULL::time;
    RETURN;
  END IF;

  IF v_hora_actual < v_ciudad.hora_inicio OR v_hora_actual >= v_ciudad.hora_fin THEN
    RETURN QUERY SELECT false,'FUERA_HORARIO',
      '✅ Placa ' || p_placa || ' puede circular en ' || p_ciudad ||
      '. Restricción de ' || to_char(v_ciudad.hora_inicio,'HH24:MI') ||
      ' a ' || to_char(v_ciudad.hora_fin,'HH24:MI') || '.',
      p_ciudad, v_ultimo_digito, v_ciudad.hora_fin;
    RETURN;
  END IF;

  IF v_ciudad.tipo_restriccion = 'digito_dia' THEN
    SELECT digitos INTO v_digitos FROM reglas_pico_placa
    WHERE ciudad_id = v_ciudad.id AND dia_semana = v_dia_semana;

    IF v_ultimo_digito = ANY(v_digitos) THEN
      RETURN QUERY SELECT true,'RESTRINGIDO',
        '🚫 Pico y placa en ' || p_ciudad || ': placa ' || p_placa ||
        ' (termina en ' || v_ultimo_digito::text || ') NO puede circular hoy hasta las ' ||
        to_char(v_ciudad.hora_fin,'HH24:MI') || '.',
        p_ciudad, v_ultimo_digito, v_ciudad.hora_fin;
    ELSE
      RETURN QUERY SELECT false,'LIBRE',
        '✅ Placa ' || p_placa || ' libre en ' || p_ciudad ||
        '. Hoy restringidos: ' || array_to_string(v_digitos,' y ') || '.',
        p_ciudad, v_ultimo_digito, v_ciudad.hora_fin;
    END IF;
    RETURN;
  END IF;

  IF v_ciudad.tipo_restriccion = 'par_impar' THEN
    IF (v_dia_mes % 2 = 1 AND v_ultimo_digito = ANY(ARRAY[6,7,8,9,0])) OR
       (v_dia_mes % 2 = 0 AND v_ultimo_digito = ANY(ARRAY[1,2,3,4,5])) THEN
      RETURN QUERY SELECT true,'RESTRINGIDO',
        '🚫 Pico y placa en ' || p_ciudad || ': día ' || v_dia_mes::text ||
        ' (' || CASE WHEN v_dia_mes % 2 = 1 THEN 'impar' ELSE 'par' END || ')' ||
        ', placa ' || p_placa || ' NO puede circular hasta las ' ||
        to_char(v_ciudad.hora_fin,'HH24:MI') || '.',
        p_ciudad, v_ultimo_digito, v_ciudad.hora_fin;
    ELSE
      RETURN QUERY SELECT false,'LIBRE',
        '✅ Placa ' || p_placa || ' libre en ' || p_ciudad ||
        ' hoy (día ' || v_dia_mes::text || ', ' ||
        CASE WHEN v_dia_mes % 2 = 1 THEN 'impar' ELSE 'par' END || ').',
        p_ciudad, v_ultimo_digito, v_ciudad.hora_fin;
    END IF;
    RETURN;
  END IF;
END;
$$;


--
-- Name: verificar_vehiculo_completo(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verificar_vehiculo_completo(p_placa text, p_ciudad text DEFAULT 'Popayán'::text) RETURNS TABLE(puede_operar boolean, bloqueo_docs boolean, restriccion_pico boolean, nivel_alerta text, mensaje_bot text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  r_docs RECORD;
  r_pico RECORD;
BEGIN
  SELECT * INTO r_docs FROM verificar_vehiculo_operable(p_placa);
  SELECT * INTO r_pico FROM verificar_pico_placa(p_placa, p_ciudad, now());

  IF NOT r_docs.puede_operar THEN
    RETURN QUERY SELECT false,true,false, r_docs.nivel_alerta, r_docs.mensaje_bot;
    RETURN;
  END IF;

  IF r_pico.tiene_restriccion THEN
    RETURN QUERY SELECT false,false,true,'PICO_PLACA',
      r_pico.mensaje_bot ||
      CASE WHEN r_docs.nivel_alerta != 'OK'
           THEN chr(10) || '⚠️ Además: ' || r_docs.mensaje_bot ELSE '' END;
    RETURN;
  END IF;

  IF r_docs.nivel_alerta != 'OK' THEN
    RETURN QUERY SELECT true,false,false, r_docs.nivel_alerta,
      r_pico.mensaje_bot || chr(10) || r_docs.mensaje_bot;
    RETURN;
  END IF;

  RETURN QUERY SELECT true,false,false,'OK',
    '✅ Vehículo ' || p_placa || ' habilitado en ' || p_ciudad ||
    '. Documentos vigentes. Sin restricción de pico y placa.';
END;
$$;


--
-- Name: verificar_vehiculo_operable(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verificar_vehiculo_operable(p_placa text) RETURNS TABLE(puede_operar boolean, nivel_alerta text, mensaje_bot text, dias_soat integer, dias_tecno integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_soat   date;
  v_tecno  date;
  v_activo boolean;
  v_bloq   boolean;
BEGIN
  SELECT soat_vencimiento, tecnomecanica_vencimiento, activo, bloqueado
  INTO   v_soat, v_tecno, v_activo, v_bloq
  FROM   vehiculos WHERE placa = p_placa;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false,'ERROR',
      '❌ Vehículo ' || p_placa || ' no encontrado.',
      NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF NOT v_activo OR v_bloq THEN
    RETURN QUERY SELECT false,'BLOQUEADO',
      '🚫 Vehículo ' || p_placa || ' bloqueado. Contacta al supervisor.',
      (v_soat - CURRENT_DATE)::integer, (v_tecno - CURRENT_DATE)::integer;
    RETURN;
  END IF;

  IF v_soat < CURRENT_DATE THEN
    RETURN QUERY SELECT false,'BLOQUEADO',
      '🚫 SOAT del vehículo ' || p_placa || ' venció el ' ||
      to_char(v_soat,'DD/MM/YYYY') || '. No puede operar.',
      (v_soat - CURRENT_DATE)::integer, (v_tecno - CURRENT_DATE)::integer;
    RETURN;
  END IF;

  IF v_tecno < CURRENT_DATE THEN
    RETURN QUERY SELECT false,'BLOQUEADO',
      '🚫 Tecnomecánica del vehículo ' || p_placa || ' venció el ' ||
      to_char(v_tecno,'DD/MM/YYYY') || '. No puede operar.',
      (v_soat - CURRENT_DATE)::integer, (v_tecno - CURRENT_DATE)::integer;
    RETURN;
  END IF;

  IF v_soat < CURRENT_DATE + 30 THEN
    RETURN QUERY SELECT true,'ALERTA_SOAT',
      '⚠️ Habilitado. SOAT vence en ' || (v_soat - CURRENT_DATE)::text ||
      ' días (' || to_char(v_soat,'DD/MM/YYYY') || '). Informa al supervisor.',
      (v_soat - CURRENT_DATE)::integer, (v_tecno - CURRENT_DATE)::integer;
    RETURN;
  END IF;

  IF v_tecno < CURRENT_DATE + 30 THEN
    RETURN QUERY SELECT true,'ALERTA_TECNO',
      '⚠️ Habilitado. Tecnomecánica vence en ' || (v_tecno - CURRENT_DATE)::text ||
      ' días (' || to_char(v_tecno,'DD/MM/YYYY') || '). Informa al supervisor.',
      (v_soat - CURRENT_DATE)::integer, (v_tecno - CURRENT_DATE)::integer;
    RETURN;
  END IF;

  RETURN QUERY SELECT true,'OK',
    '✅ Vehículo ' || p_placa || ' habilitado. Documentos vigentes.',
    (v_soat - CURRENT_DATE)::integer, (v_tecno - CURRENT_DATE)::integer;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accesos_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accesos_auditoria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    sede_id uuid,
    modulos jsonb DEFAULT '[]'::jsonb,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    otorgado_por uuid,
    activo boolean DEFAULT true,
    motivo text
);


--
-- Name: activos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_activo_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    sede_id uuid,
    codigo text NOT NULL,
    nombre text NOT NULL,
    estado text DEFAULT 'operativo'::text,
    datos jsonb DEFAULT '{}'::jsonb,
    documentos jsonb DEFAULT '{}'::jsonb,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    placa text,
    kilometraje integer DEFAULT 0,
    horometro integer DEFAULT 0,
    bloqueado boolean DEFAULT false,
    motivo_bloqueo text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT activos_estado_check CHECK ((estado = ANY (ARRAY['operativo'::text, 'bloqueado'::text, 'taller'::text, 'retirado'::text])))
);


--
-- Name: TABLE activos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.activos IS 'Registro universal de activos inspeccionables';


--
-- Name: COLUMN activos.codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activos.codigo IS 'Placa (vehículos), serial (equipos), código interno';


--
-- Name: COLUMN activos.nombre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activos.nombre IS 'Descripción legible: Toyota Hilux MSO120, Escalera #14';


--
-- Name: COLUMN activos.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activos.estado IS 'operativo, taller, retirado, bloqueado';


--
-- Name: COLUMN activos.datos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activos.datos IS 'JSONB con datos específicos del tipo (marca, modelo, año, capacidad, etc.)';


--
-- Name: COLUMN activos.documentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.activos.documentos IS 'JSONB con fechas de vencimiento aplicables';


--
-- Name: autorizaciones_novedad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autorizaciones_novedad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    preoperacional_id uuid NOT NULL,
    conductor_id uuid,
    novedades_bloqueo jsonb DEFAULT '[]'::jsonb NOT NULL,
    decision text,
    justificacion text,
    supervisor_id uuid,
    timestamp_alerta timestamp with time zone DEFAULT now() NOT NULL,
    timestamp_decision timestamp with time zone,
    sede_id uuid,
    activo_id uuid NOT NULL
);


--
-- Name: ciudades_pico_placa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ciudades_pico_placa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ciudad text NOT NULL,
    departamento text,
    tipo_restriccion text NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    aplica_motos boolean DEFAULT true NOT NULL,
    aplica_sabado boolean DEFAULT false NOT NULL,
    aplica_domingo boolean DEFAULT false NOT NULL,
    aplica_festivos boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    vigente_desde date,
    vigente_hasta date,
    decreto text,
    observaciones text,
    CONSTRAINT ciudades_pico_placa_tipo_restriccion_check CHECK ((tipo_restriccion = ANY (ARRAY['digito_dia'::text, 'par_impar'::text])))
);


--
-- Name: conductores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conductores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    cedula text NOT NULL,
    telefono text NOT NULL,
    licencia_categoria text,
    licencia_vencimiento date,
    cargo text DEFAULT 'Operario'::text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    sede_id uuid,
    empresa_id uuid
);


--
-- Name: configuracion_sede; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_sede (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sede_id uuid NOT NULL,
    clave text NOT NULL,
    valor text
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    nit text NOT NULL,
    ciudad text,
    logo_url text,
    activa boolean DEFAULT true,
    plan text DEFAULT 'starter'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: evidencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entidad_tipo text NOT NULL,
    entidad_id uuid NOT NULL,
    tipo text NOT NULL,
    descripcion text,
    foto_url text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT evidencia_entidad_tipo_check CHECK ((entidad_tipo = ANY (ARRAY['preoperacional'::text, 'posoperacional'::text, 'tanqueo'::text])))
);


--
-- Name: fotos_evidencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fotos_evidencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    preoperacional_id uuid NOT NULL,
    tipo text NOT NULL,
    descripcion text,
    foto_url text NOT NULL,
    validada boolean DEFAULT false,
    resultado_validacion text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fotos_posoperacional; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fotos_posoperacional (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    posoperacional_id uuid NOT NULL,
    novedad_id uuid,
    tipo text NOT NULL,
    descripcion text,
    foto_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fotos_posoperacional_tipo_check CHECK ((tipo = ANY (ARRAY['odometro'::text, 'novedad'::text])))
);


--
-- Name: fotos_tanqueo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fotos_tanqueo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tanqueo_id uuid NOT NULL,
    tipo text NOT NULL,
    descripcion text,
    foto_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fotos_tanqueo_tipo_check CHECK ((tipo = ANY (ARRAY['factura'::text, 'odometro'::text, 'surtidor'::text, 'vehiculo'::text, 'placa'::text])))
);


--
-- Name: historial_estado_activo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_estado_activo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activo_id uuid NOT NULL,
    estado_anterior text,
    estado_nuevo text NOT NULL,
    motivo text,
    categoria_motivo text,
    referencia_id uuid,
    referencia_tipo text,
    cambiado_por uuid,
    sede_id uuid,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE historial_estado_activo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.historial_estado_activo IS 'Historial de cambios de estado por activo — base para dashboard';


--
-- Name: COLUMN historial_estado_activo.categoria_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historial_estado_activo.categoria_motivo IS 'documento, novedad_bloqueo, mantenimiento, retirado, manual';


--
-- Name: COLUMN historial_estado_activo.referencia_tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historial_estado_activo.referencia_tipo IS 'preoperacional, autorizacion, alerta, manual';


--
-- Name: COLUMN historial_estado_activo.cambiado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historial_estado_activo.cambiado_por IS 'UUID de conductor o usuario_panel';


--
-- Name: novedades_posoperacional; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.novedades_posoperacional (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    posoperacional_id uuid NOT NULL,
    tipo text NOT NULL,
    descripcion text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: permisos_rol; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos_rol (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rol_id uuid NOT NULL,
    modulo text NOT NULL,
    accion text NOT NULL,
    permitido boolean DEFAULT true
);


--
-- Name: permisos_trabajo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos_trabajo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    empresa_id uuid NOT NULL,
    sede_id uuid,
    trabajador_id uuid,
    ubicacion text,
    descripcion_trabajo text,
    riesgos_identificados jsonb DEFAULT '[]'::jsonb,
    controles jsonb DEFAULT '[]'::jsonb,
    equipos_requeridos jsonb DEFAULT '[]'::jsonb,
    estado text DEFAULT 'borrador'::text,
    firma_trabajador boolean DEFAULT false,
    firma_supervisor boolean DEFAULT false,
    firma_sst boolean DEFAULT false,
    aprobado_por uuid,
    fecha_inicio timestamp with time zone,
    fecha_fin timestamp with time zone,
    observaciones text,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE permisos_trabajo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.permisos_trabajo IS 'Permisos de trabajo — Fase 3 (ATS, altura, eléctrico, confinado)';


--
-- Name: COLUMN permisos_trabajo.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permisos_trabajo.tipo IS 'ats, altura, riesgo_electrico, espacio_confinado';


--
-- Name: COLUMN permisos_trabajo.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.permisos_trabajo.estado IS 'borrador, pendiente, aprobado, rechazado, cerrado';


--
-- Name: plantilla_grupos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_grupos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plantilla_id uuid NOT NULL,
    nombre text NOT NULL,
    abreviado text,
    orden integer DEFAULT 0 NOT NULL,
    solo_panel boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: plantilla_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    orden integer DEFAULT 0 NOT NULL,
    critico boolean DEFAULT false NOT NULL,
    sin_foto boolean DEFAULT false NOT NULL,
    sin_validacion boolean DEFAULT false NOT NULL,
    nunca_bloquea boolean DEFAULT false NOT NULL,
    sub_pregunta jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: plantillas_inspeccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantillas_inspeccion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid,
    tipo_activo_id uuid NOT NULL,
    tipo_inspeccion text DEFAULT 'preoperacional'::text NOT NULL,
    nombre text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT plantillas_tipo_inspeccion_check CHECK ((tipo_inspeccion = ANY (ARRAY['preoperacional'::text, 'posoperacional'::text])))
);


--
-- Name: posoperacionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posoperacionales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activo_id uuid NOT NULL,
    conductor_id uuid NOT NULL,
    kilometraje_final integer NOT NULL,
    horometro_final integer,
    km_referencia integer,
    diferencia_km integer,
    inconsistencia_km boolean DEFAULT false,
    kilometraje_confirmado boolean DEFAULT false,
    alertas_km jsonb DEFAULT '[]'::jsonb,
    origen_kilometraje text,
    kilometraje_inicial integer,
    km_detectado integer,
    km_lectura_fuera_rango boolean DEFAULT false,
    horas_trabajadas numeric,
    estado_general text DEFAULT 'OK'::text,
    novedades jsonb DEFAULT '[]'::jsonb,
    observaciones text,
    firmado boolean DEFAULT false,
    firmado_timestamp timestamp with time zone,
    pdf_url text,
    ip_address inet,
    sede_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    plantilla_id uuid
);


--
-- Name: preoperacionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preoperacionales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activo_id uuid NOT NULL,
    plantilla_id uuid NOT NULL,
    conductor_id uuid NOT NULL,
    kilometraje integer,
    horometro integer,
    km_referencia integer,
    diferencia_km integer,
    inconsistencia_km boolean DEFAULT false,
    alertas_km jsonb DEFAULT '[]'::jsonb,
    fecha date DEFAULT CURRENT_DATE,
    hora time without time zone DEFAULT CURRENT_TIME,
    estado text DEFAULT 'en_curso'::text,
    respuestas jsonb DEFAULT '{}'::jsonb NOT NULL,
    novedades jsonb DEFAULT '[]'::jsonb,
    observaciones text,
    firma_operario boolean DEFAULT false,
    firma_timestamp timestamp with time zone,
    pdf_url text,
    clasificacion text,
    sede_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT preop_estado_check CHECK ((estado = ANY (ARRAY['en_curso'::text, 'completado'::text, 'cancelado'::text])))
);


--
-- Name: reglas_pico_placa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reglas_pico_placa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ciudad_id uuid NOT NULL,
    dia_semana integer NOT NULL,
    digitos integer[] NOT NULL,
    CONSTRAINT reglas_pico_placa_dia_semana_check CHECK (((dia_semana >= 1) AND (dia_semana <= 7)))
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid,
    nombre text NOT NULL,
    descripcion text,
    es_base boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sedes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sedes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    ciudad text,
    direccion text,
    activa boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sesiones_activas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones_activas (
    telefono text NOT NULL,
    datos jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval)
);


--
-- Name: tanqueos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tanqueos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conductor_id uuid,
    tipo_combustible text,
    cantidad numeric NOT NULL,
    unidad_medida text DEFAULT 'litros'::text NOT NULL,
    valor_total numeric NOT NULL,
    precio_unitario numeric,
    tanque_lleno boolean DEFAULT false NOT NULL,
    estacion_servicio text,
    ciudad text,
    factura_numero text,
    kilometraje integer NOT NULL,
    km_referencia integer,
    diferencia_km integer,
    inconsistencia_km boolean DEFAULT false NOT NULL,
    alertas jsonb DEFAULT '[]'::jsonb NOT NULL,
    observaciones text,
    pdf_url text,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now(),
    telefono_reporta text NOT NULL,
    nombre_reportado text,
    updated_at timestamp with time zone DEFAULT now(),
    sede_id uuid,
    factura_numero_manual text,
    factura_numero_ocr text,
    placa_ocr_factura text,
    placa_ocr_foto text,
    km_ocr_factura integer,
    km_ocr_odometro integer,
    cantidad_manual numeric(10,3),
    cantidad_ocr numeric(10,3),
    datos_ocr_factura jsonb,
    estado_validacion text DEFAULT 'pendiente_revision'::text,
    discrepancias jsonb DEFAULT '[]'::jsonb,
    rendimiento_calculado numeric(8,2),
    rendimiento_alerta boolean DEFAULT false,
    validado_por text,
    fecha_validacion timestamp with time zone,
    motivo_rechazo text,
    tipo_tanqueo text DEFAULT 'convenio'::text,
    es_primer_tanqueo boolean DEFAULT false,
    score_ocr_global numeric(4,3) DEFAULT 0,
    tier_ocr integer DEFAULT 3,
    serial_ibutton text,
    autorizacion_terpel text,
    nit_estacion text,
    flag_sin_factura boolean DEFAULT false,
    tiene_factura_fisica boolean DEFAULT true,
    revisado_por text,
    fecha_revision timestamp with time zone,
    notas_admin text,
    activo_id uuid NOT NULL,
    horometro integer,
    plantilla_id uuid,
    conductor_id_v2 uuid,
    CONSTRAINT tanqueos_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT tanqueos_estado_validacion_check CHECK ((estado_validacion = ANY (ARRAY['pendiente_revision'::text, 'aprobado'::text, 'rechazado'::text]))),
    CONSTRAINT tanqueos_tipo_check CHECK ((tipo_tanqueo = ANY (ARRAY['convenio'::text, 'efectivo'::text, 'tarjeta'::text]))),
    CONSTRAINT tanqueos_tipo_combustible_check CHECK ((tipo_combustible = ANY (ARRAY['diesel'::text, 'gasolina'::text, 'gas'::text, 'adblue'::text, 'otro'::text]))),
    CONSTRAINT tanqueos_unidad_medida_check CHECK ((unidad_medida = ANY (ARRAY['litros'::text, 'galones'::text]))),
    CONSTRAINT tanqueos_valor_total_check CHECK ((valor_total >= (0)::numeric))
);


--
-- Name: tanqueos_ocr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tanqueos_ocr (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tanqueo_id uuid NOT NULL,
    factura_numero_ocr text,
    placa_ocr_factura text,
    placa_ocr_foto text,
    km_ocr_factura integer,
    km_ocr_odometro integer,
    cantidad_ocr numeric,
    datos_brutos jsonb,
    score_ocr_global numeric DEFAULT 0,
    tier_ocr integer DEFAULT 3,
    discrepancias jsonb DEFAULT '[]'::jsonb,
    estado_validacion text DEFAULT 'pendiente_revision'::text,
    validado_por text,
    fecha_validacion timestamp with time zone,
    motivo_rechazo text,
    revisado_por text,
    fecha_revision timestamp with time zone,
    notas_admin text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tanqueos_ocr_estado_check CHECK ((estado_validacion = ANY (ARRAY['pendiente_revision'::text, 'aprobado'::text, 'rechazado'::text])))
);


--
-- Name: tipos_activo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_activo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    categoria text NOT NULL,
    requiere_inspeccion boolean DEFAULT true,
    frecuencia_inspeccion text DEFAULT 'diaria'::text,
    activo boolean DEFAULT true
);


--
-- Name: TABLE tipos_activo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tipos_activo IS 'Catálogo de tipos de activo inspeccionables';


--
-- Name: COLUMN tipos_activo.codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tipos_activo.codigo IS 'Identificador único: vehiculo, escalera, taladro, arnes, epp';


--
-- Name: COLUMN tipos_activo.categoria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tipos_activo.categoria IS 'Agrupación: flota, equipo, epp';


--
-- Name: COLUMN tipos_activo.frecuencia_inspeccion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tipos_activo.frecuencia_inspeccion IS 'diaria, semanal, mensual, por_uso';


--
-- Name: turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sede_id uuid NOT NULL,
    nombre text NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    duracion_horas integer DEFAULT 8,
    activo boolean DEFAULT true
);


--
-- Name: usuarios_panel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_panel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid,
    nombre text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    telefono text,
    activo boolean DEFAULT true,
    ultimo_acceso timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    debe_cambiar_password boolean DEFAULT false NOT NULL,
    creado_por uuid,
    actualizado_en timestamp with time zone DEFAULT now()
);


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    rol_id uuid NOT NULL,
    sede_id uuid,
    turno_id uuid,
    fecha_inicio date DEFAULT CURRENT_DATE,
    fecha_fin date,
    activo boolean DEFAULT true,
    otorgado_por uuid
);


--
-- Name: v_estado_documentos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_estado_documentos AS
 SELECT a.id AS activo_id,
    a.placa,
    ta.nombre AS tipo,
    (a.datos ->> 'marca'::text) AS marca,
    a.activo,
    a.bloqueado,
    ((a.documentos ->> 'soat_vencimiento'::text))::date AS soat_vencimiento,
        CASE
            WHEN (((a.documentos ->> 'soat_vencimiento'::text) IS NULL) OR ((a.documentos ->> 'soat_vencimiento'::text) = ''::text)) THEN 'sin_dato'::text
            WHEN (((a.documentos ->> 'soat_vencimiento'::text))::date < CURRENT_DATE) THEN 'vencido'::text
            WHEN (((a.documentos ->> 'soat_vencimiento'::text))::date <= (CURRENT_DATE + 7)) THEN 'critico'::text
            WHEN (((a.documentos ->> 'soat_vencimiento'::text))::date <= (CURRENT_DATE + 15)) THEN 'urgente'::text
            WHEN (((a.documentos ->> 'soat_vencimiento'::text))::date <= (CURRENT_DATE + 30)) THEN 'proximo'::text
            ELSE 'vigente'::text
        END AS estado_soat,
        CASE
            WHEN (((a.documentos ->> 'soat_vencimiento'::text) IS NULL) OR ((a.documentos ->> 'soat_vencimiento'::text) = ''::text)) THEN NULL::integer
            ELSE (((a.documentos ->> 'soat_vencimiento'::text))::date - CURRENT_DATE)
        END AS dias_soat,
    ((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date AS tecnomecanica_vencimiento,
        CASE
            WHEN (((a.documentos ->> 'tecnomecanica_vencimiento'::text) IS NULL) OR ((a.documentos ->> 'tecnomecanica_vencimiento'::text) = ''::text)) THEN 'sin_dato'::text
            WHEN (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date < CURRENT_DATE) THEN 'vencido'::text
            WHEN (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date <= (CURRENT_DATE + 7)) THEN 'critico'::text
            WHEN (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date <= (CURRENT_DATE + 15)) THEN 'urgente'::text
            WHEN (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date <= (CURRENT_DATE + 30)) THEN 'proximo'::text
            ELSE 'vigente'::text
        END AS estado_tecno,
        CASE
            WHEN (((a.documentos ->> 'tecnomecanica_vencimiento'::text) IS NULL) OR ((a.documentos ->> 'tecnomecanica_vencimiento'::text) = ''::text)) THEN NULL::integer
            ELSE (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date - CURRENT_DATE)
        END AS dias_tecno,
        CASE
            WHEN ((((a.documentos ->> 'soat_vencimiento'::text) IS NOT NULL) AND ((a.documentos ->> 'soat_vencimiento'::text) <> ''::text) AND (((a.documentos ->> 'soat_vencimiento'::text))::date < CURRENT_DATE)) OR (((a.documentos ->> 'tecnomecanica_vencimiento'::text) IS NOT NULL) AND ((a.documentos ->> 'tecnomecanica_vencimiento'::text) <> ''::text) AND (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date < CURRENT_DATE))) THEN 'rojo'::text
            WHEN ((((a.documentos ->> 'soat_vencimiento'::text) IS NOT NULL) AND ((a.documentos ->> 'soat_vencimiento'::text) <> ''::text) AND (((a.documentos ->> 'soat_vencimiento'::text))::date <= (CURRENT_DATE + 15))) OR (((a.documentos ->> 'tecnomecanica_vencimiento'::text) IS NOT NULL) AND ((a.documentos ->> 'tecnomecanica_vencimiento'::text) <> ''::text) AND (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date <= (CURRENT_DATE + 15)))) THEN 'naranja'::text
            WHEN ((((a.documentos ->> 'soat_vencimiento'::text) IS NOT NULL) AND ((a.documentos ->> 'soat_vencimiento'::text) <> ''::text) AND (((a.documentos ->> 'soat_vencimiento'::text))::date <= (CURRENT_DATE + 30))) OR (((a.documentos ->> 'tecnomecanica_vencimiento'::text) IS NOT NULL) AND ((a.documentos ->> 'tecnomecanica_vencimiento'::text) <> ''::text) AND (((a.documentos ->> 'tecnomecanica_vencimiento'::text))::date <= (CURRENT_DATE + 30)))) THEN 'amarillo'::text
            ELSE 'verde'::text
        END AS semaforo
   FROM (public.activos a
     JOIN public.tipos_activo ta ON ((ta.id = a.tipo_activo_id)))
  WHERE ((ta.categoria = 'flota'::text) AND (a.activo = true));


--
-- Name: v_pico_placa_hoy; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_pico_placa_hoy AS
 SELECT ciudad,
    ((to_char((hora_inicio)::interval, 'HH24:MI'::text) || ' - '::text) || to_char((hora_fin)::interval, 'HH24:MI'::text)) AS horario,
        CASE tipo_restriccion
            WHEN 'par_impar'::text THEN
            CASE
                WHEN (((EXTRACT(day FROM now()))::integer % 2) = 1) THEN 'Restringidos: 6,7,8,9,0'::text
                ELSE 'Restringidos: 1,2,3,4,5'::text
            END
            WHEN 'digito_dia'::text THEN COALESCE(( SELECT array_to_string(r.digitos, ', '::text) AS array_to_string
               FROM public.reglas_pico_placa r
              WHERE ((r.ciudad_id = c.id) AND (r.dia_semana = (EXTRACT(isodow FROM now()))::integer))), 'Sin restricción hoy'::text)
            ELSE NULL::text
        END AS digitos_restringidos_hoy,
    aplica_motos,
    vigente_hasta,
    decreto
   FROM public.ciudades_pico_placa c
  WHERE (activo = true)
  ORDER BY ciudad;


--
-- Name: accesos_auditoria accesos_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accesos_auditoria
    ADD CONSTRAINT accesos_auditoria_pkey PRIMARY KEY (id);


--
-- Name: activos activos_empresa_codigo_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_empresa_codigo_unico UNIQUE (empresa_id, codigo);


--
-- Name: activos activos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_pkey PRIMARY KEY (id);


--
-- Name: activos activos_placa_empresa_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_placa_empresa_unique UNIQUE (placa, empresa_id);


--
-- Name: autorizaciones_novedad autorizaciones_novedad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autorizaciones_novedad
    ADD CONSTRAINT autorizaciones_novedad_pkey PRIMARY KEY (id);


--
-- Name: ciudades_pico_placa ciudades_pico_placa_ciudad_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciudades_pico_placa
    ADD CONSTRAINT ciudades_pico_placa_ciudad_key UNIQUE (ciudad);


--
-- Name: ciudades_pico_placa ciudades_pico_placa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciudades_pico_placa
    ADD CONSTRAINT ciudades_pico_placa_pkey PRIMARY KEY (id);


--
-- Name: conductores conductores_cedula_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conductores
    ADD CONSTRAINT conductores_cedula_key UNIQUE (cedula);


--
-- Name: conductores conductores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conductores
    ADD CONSTRAINT conductores_pkey PRIMARY KEY (id);


--
-- Name: conductores conductores_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conductores
    ADD CONSTRAINT conductores_telefono_key UNIQUE (telefono);


--
-- Name: configuracion_sede configuracion_sede_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_sede
    ADD CONSTRAINT configuracion_sede_pkey PRIMARY KEY (id);


--
-- Name: configuracion_sede configuracion_sede_sede_id_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_sede
    ADD CONSTRAINT configuracion_sede_sede_id_clave_key UNIQUE (sede_id, clave);


--
-- Name: empresas empresas_nit_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_nit_key UNIQUE (nit);


--
-- Name: empresas empresas_nit_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_nit_unique UNIQUE (nit);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: evidencia evidencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencia
    ADD CONSTRAINT evidencia_pkey PRIMARY KEY (id);


--
-- Name: fotos_evidencia fotos_evidencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_evidencia
    ADD CONSTRAINT fotos_evidencia_pkey PRIMARY KEY (id);


--
-- Name: fotos_posoperacional fotos_posoperacional_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_posoperacional
    ADD CONSTRAINT fotos_posoperacional_pkey PRIMARY KEY (id);


--
-- Name: fotos_tanqueo fotos_tanqueo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_tanqueo
    ADD CONSTRAINT fotos_tanqueo_pkey PRIMARY KEY (id);


--
-- Name: historial_estado_activo historial_estado_activo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_activo
    ADD CONSTRAINT historial_estado_activo_pkey PRIMARY KEY (id);


--
-- Name: novedades_posoperacional novedades_posoperacional_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_posoperacional
    ADD CONSTRAINT novedades_posoperacional_pkey PRIMARY KEY (id);


--
-- Name: permisos_rol permisos_rol_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_rol
    ADD CONSTRAINT permisos_rol_pkey PRIMARY KEY (id);


--
-- Name: permisos_rol permisos_rol_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_rol
    ADD CONSTRAINT permisos_rol_unique UNIQUE (rol_id, modulo, accion);


--
-- Name: permisos_trabajo permisos_trabajo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_trabajo
    ADD CONSTRAINT permisos_trabajo_pkey PRIMARY KEY (id);


--
-- Name: plantilla_grupos plantilla_grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_grupos
    ADD CONSTRAINT plantilla_grupos_pkey PRIMARY KEY (id);


--
-- Name: plantilla_items plantilla_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_items
    ADD CONSTRAINT plantilla_items_pkey PRIMARY KEY (id);


--
-- Name: plantillas_inspeccion plantillas_inspeccion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_inspeccion
    ADD CONSTRAINT plantillas_inspeccion_pkey PRIMARY KEY (id);


--
-- Name: posoperacionales posoperacionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posoperacionales
    ADD CONSTRAINT posoperacionales_pkey PRIMARY KEY (id);


--
-- Name: preoperacionales preoperacionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preoperacionales
    ADD CONSTRAINT preoperacionales_pkey PRIMARY KEY (id);


--
-- Name: reglas_pico_placa reglas_pico_placa_ciudad_id_dia_semana_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_pico_placa
    ADD CONSTRAINT reglas_pico_placa_ciudad_id_dia_semana_key UNIQUE (ciudad_id, dia_semana);


--
-- Name: reglas_pico_placa reglas_pico_placa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_pico_placa
    ADD CONSTRAINT reglas_pico_placa_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sedes sedes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sedes
    ADD CONSTRAINT sedes_pkey PRIMARY KEY (id);


--
-- Name: sesiones_activas sesiones_activas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones_activas
    ADD CONSTRAINT sesiones_activas_pkey PRIMARY KEY (telefono);


--
-- Name: tanqueos_ocr tanqueos_ocr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos_ocr
    ADD CONSTRAINT tanqueos_ocr_pkey PRIMARY KEY (id);


--
-- Name: tanqueos_ocr tanqueos_ocr_tanqueo_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos_ocr
    ADD CONSTRAINT tanqueos_ocr_tanqueo_id_unique UNIQUE (tanqueo_id);


--
-- Name: tanqueos tanqueos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos
    ADD CONSTRAINT tanqueos_pkey PRIMARY KEY (id);


--
-- Name: tipos_activo tipos_activo_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_activo
    ADD CONSTRAINT tipos_activo_codigo_key UNIQUE (codigo);


--
-- Name: tipos_activo tipos_activo_codigo_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_activo
    ADD CONSTRAINT tipos_activo_codigo_unique UNIQUE (codigo);


--
-- Name: tipos_activo tipos_activo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_activo
    ADD CONSTRAINT tipos_activo_pkey PRIMARY KEY (id);


--
-- Name: turnos turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_pkey PRIMARY KEY (id);


--
-- Name: usuarios_panel usuarios_panel_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_panel
    ADD CONSTRAINT usuarios_panel_email_key UNIQUE (email);


--
-- Name: usuarios_panel usuarios_panel_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_panel
    ADD CONSTRAINT usuarios_panel_email_unique UNIQUE (email);


--
-- Name: usuarios_panel usuarios_panel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_panel
    ADD CONSTRAINT usuarios_panel_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles usuarios_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_pkey PRIMARY KEY (id);


--
-- Name: evidencia_entidad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidencia_entidad_idx ON public.evidencia USING btree (entidad_tipo, entidad_id);


--
-- Name: idx_activos_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activos_codigo ON public.activos USING btree (codigo);


--
-- Name: idx_activos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activos_empresa ON public.activos USING btree (empresa_id);


--
-- Name: idx_activos_placa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activos_placa ON public.activos USING btree (placa);


--
-- Name: idx_activos_sede; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activos_sede ON public.activos USING btree (sede_id);


--
-- Name: idx_activos_tipo_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activos_tipo_activo ON public.activos USING btree (tipo_activo_id);


--
-- Name: idx_autorizaciones_activo_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_autorizaciones_activo_pendiente ON public.autorizaciones_novedad USING btree (activo_id) WHERE (decision IS NULL);


--
-- Name: idx_fotos_tanqueo_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fotos_tanqueo_tipo ON public.fotos_tanqueo USING btree (tanqueo_id, tipo);


--
-- Name: idx_historial_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_activo ON public.historial_estado_activo USING btree (activo_id);


--
-- Name: idx_historial_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_estado ON public.historial_estado_activo USING btree (estado_nuevo);


--
-- Name: idx_historial_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_timestamp ON public.historial_estado_activo USING btree ("timestamp" DESC);


--
-- Name: idx_permisos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permisos_estado ON public.permisos_trabajo USING btree (estado);


--
-- Name: idx_permisos_sede; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permisos_sede ON public.permisos_trabajo USING btree (sede_id);


--
-- Name: idx_permisos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permisos_tipo ON public.permisos_trabajo USING btree (tipo);


--
-- Name: idx_plantilla_activa_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_plantilla_activa_unica ON public.plantillas_inspeccion USING btree (tipo_activo_id, tipo_inspeccion, COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (activa = true);


--
-- Name: idx_plantilla_grupos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_grupos_orden ON public.plantilla_grupos USING btree (plantilla_id, orden);


--
-- Name: idx_plantilla_items_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plantilla_items_grupo ON public.plantilla_items USING btree (grupo_id, orden);


--
-- Name: idx_posop_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posop_activo ON public.posoperacionales USING btree (activo_id);


--
-- Name: idx_posop_conductor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posop_conductor ON public.posoperacionales USING btree (conductor_id);


--
-- Name: idx_preop_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preop_activo ON public.preoperacionales USING btree (activo_id);


--
-- Name: idx_preop_conductor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preop_conductor ON public.preoperacionales USING btree (conductor_id);


--
-- Name: idx_preop_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preop_fecha ON public.preoperacionales USING btree (fecha);


--
-- Name: idx_preop_sede; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preop_sede ON public.preoperacionales USING btree (sede_id);


--
-- Name: idx_sesiones_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sesiones_expires ON public.sesiones_activas USING btree (expires_at);


--
-- Name: idx_tanqueos_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tanqueos_activo ON public.tanqueos USING btree (activo_id);


--
-- Name: idx_tanqueos_conductor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tanqueos_conductor ON public.tanqueos USING btree (conductor_id);


--
-- Name: idx_tanqueos_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tanqueos_created ON public.tanqueos USING btree (created_at);


--
-- Name: idx_tanqueos_estado_validacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tanqueos_estado_validacion ON public.tanqueos USING btree (estado_validacion);


--
-- Name: idx_tanqueos_telefono; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tanqueos_telefono ON public.tanqueos USING btree (telefono_reporta);


--
-- Name: idx_tanqueos_telefono_reporta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tanqueos_telefono_reporta ON public.tanqueos USING btree (telefono_reporta);


--
-- Name: accesos_auditoria accesos_auditoria_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accesos_auditoria
    ADD CONSTRAINT accesos_auditoria_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: accesos_auditoria accesos_auditoria_otorgado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accesos_auditoria
    ADD CONSTRAINT accesos_auditoria_otorgado_por_fkey FOREIGN KEY (otorgado_por) REFERENCES public.usuarios_panel(id);


--
-- Name: accesos_auditoria accesos_auditoria_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accesos_auditoria
    ADD CONSTRAINT accesos_auditoria_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: accesos_auditoria accesos_auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accesos_auditoria
    ADD CONSTRAINT accesos_auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios_panel(id);


--
-- Name: activos activos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: activos activos_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: activos activos_tipo_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activos
    ADD CONSTRAINT activos_tipo_activo_id_fkey FOREIGN KEY (tipo_activo_id) REFERENCES public.tipos_activo(id);


--
-- Name: autorizaciones_novedad autorizaciones_novedad_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autorizaciones_novedad
    ADD CONSTRAINT autorizaciones_novedad_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES public.activos(id);


--
-- Name: autorizaciones_novedad autorizaciones_novedad_conductor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autorizaciones_novedad
    ADD CONSTRAINT autorizaciones_novedad_conductor_id_fkey FOREIGN KEY (conductor_id) REFERENCES public.conductores(id);


--
-- Name: autorizaciones_novedad autorizaciones_novedad_preoperacional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autorizaciones_novedad
    ADD CONSTRAINT autorizaciones_novedad_preoperacional_id_fkey FOREIGN KEY (preoperacional_id) REFERENCES public.preoperacionales(id);


--
-- Name: autorizaciones_novedad autorizaciones_novedad_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autorizaciones_novedad
    ADD CONSTRAINT autorizaciones_novedad_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: autorizaciones_novedad autorizaciones_novedad_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autorizaciones_novedad
    ADD CONSTRAINT autorizaciones_novedad_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.conductores(id);


--
-- Name: conductores conductores_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conductores
    ADD CONSTRAINT conductores_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: configuracion_sede configuracion_sede_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_sede
    ADD CONSTRAINT configuracion_sede_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: fotos_evidencia fotos_evidencia_preoperacional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_evidencia
    ADD CONSTRAINT fotos_evidencia_preoperacional_id_fkey FOREIGN KEY (preoperacional_id) REFERENCES public.preoperacionales(id);


--
-- Name: fotos_posoperacional fotos_posoperacional_novedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_posoperacional
    ADD CONSTRAINT fotos_posoperacional_novedad_id_fkey FOREIGN KEY (novedad_id) REFERENCES public.novedades_posoperacional(id);


--
-- Name: fotos_posoperacional fotos_posoperacional_posoperacional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_posoperacional
    ADD CONSTRAINT fotos_posoperacional_posoperacional_id_fkey FOREIGN KEY (posoperacional_id) REFERENCES public.posoperacionales(id);


--
-- Name: fotos_tanqueo fotos_tanqueo_tanqueo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos_tanqueo
    ADD CONSTRAINT fotos_tanqueo_tanqueo_id_fkey FOREIGN KEY (tanqueo_id) REFERENCES public.tanqueos(id) ON DELETE CASCADE;


--
-- Name: historial_estado_activo historial_estado_activo_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_activo
    ADD CONSTRAINT historial_estado_activo_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES public.activos(id);


--
-- Name: historial_estado_activo historial_estado_activo_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_estado_activo
    ADD CONSTRAINT historial_estado_activo_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: novedades_posoperacional novedades_posoperacional_posoperacional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_posoperacional
    ADD CONSTRAINT novedades_posoperacional_posoperacional_id_fkey FOREIGN KEY (posoperacional_id) REFERENCES public.posoperacionales(id);


--
-- Name: permisos_rol permisos_rol_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_rol
    ADD CONSTRAINT permisos_rol_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id);


--
-- Name: permisos_trabajo permisos_trabajo_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_trabajo
    ADD CONSTRAINT permisos_trabajo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: permisos_trabajo permisos_trabajo_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_trabajo
    ADD CONSTRAINT permisos_trabajo_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: permisos_trabajo permisos_trabajo_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos_trabajo
    ADD CONSTRAINT permisos_trabajo_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES public.conductores(id);


--
-- Name: plantilla_grupos plantilla_grupos_plantilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_grupos
    ADD CONSTRAINT plantilla_grupos_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_inspeccion(id) ON DELETE CASCADE;


--
-- Name: plantilla_items plantilla_items_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_items
    ADD CONSTRAINT plantilla_items_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.plantilla_grupos(id) ON DELETE CASCADE;


--
-- Name: plantillas_inspeccion plantillas_inspeccion_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_inspeccion
    ADD CONSTRAINT plantillas_inspeccion_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: plantillas_inspeccion plantillas_inspeccion_tipo_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas_inspeccion
    ADD CONSTRAINT plantillas_inspeccion_tipo_activo_id_fkey FOREIGN KEY (tipo_activo_id) REFERENCES public.tipos_activo(id);


--
-- Name: posoperacionales posoperacionales_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posoperacionales
    ADD CONSTRAINT posoperacionales_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES public.activos(id);


--
-- Name: posoperacionales posoperacionales_conductor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posoperacionales
    ADD CONSTRAINT posoperacionales_conductor_id_fkey FOREIGN KEY (conductor_id) REFERENCES public.conductores(id);


--
-- Name: posoperacionales posoperacionales_plantilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posoperacionales
    ADD CONSTRAINT posoperacionales_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_inspeccion(id);


--
-- Name: posoperacionales posoperacionales_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posoperacionales
    ADD CONSTRAINT posoperacionales_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: preoperacionales preoperacionales_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preoperacionales
    ADD CONSTRAINT preoperacionales_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES public.activos(id);


--
-- Name: preoperacionales preoperacionales_conductor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preoperacionales
    ADD CONSTRAINT preoperacionales_conductor_id_fkey FOREIGN KEY (conductor_id) REFERENCES public.conductores(id);


--
-- Name: preoperacionales preoperacionales_plantilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preoperacionales
    ADD CONSTRAINT preoperacionales_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_inspeccion(id);


--
-- Name: preoperacionales preoperacionales_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preoperacionales
    ADD CONSTRAINT preoperacionales_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: reglas_pico_placa reglas_pico_placa_ciudad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_pico_placa
    ADD CONSTRAINT reglas_pico_placa_ciudad_id_fkey FOREIGN KEY (ciudad_id) REFERENCES public.ciudades_pico_placa(id) ON DELETE CASCADE;


--
-- Name: roles roles_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: sedes sedes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sedes
    ADD CONSTRAINT sedes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: tanqueos tanqueos_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos
    ADD CONSTRAINT tanqueos_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES public.activos(id);


--
-- Name: tanqueos tanqueos_conductor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos
    ADD CONSTRAINT tanqueos_conductor_id_fkey FOREIGN KEY (conductor_id) REFERENCES public.conductores(id);


--
-- Name: tanqueos_ocr tanqueos_ocr_tanqueo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos_ocr
    ADD CONSTRAINT tanqueos_ocr_tanqueo_id_fkey FOREIGN KEY (tanqueo_id) REFERENCES public.tanqueos(id) ON DELETE CASCADE;


--
-- Name: tanqueos tanqueos_plantilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos
    ADD CONSTRAINT tanqueos_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES public.plantillas_inspeccion(id);


--
-- Name: tanqueos tanqueos_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanqueos
    ADD CONSTRAINT tanqueos_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: turnos turnos_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: usuarios_panel usuarios_panel_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_panel
    ADD CONSTRAINT usuarios_panel_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios_panel(id) ON DELETE SET NULL;


--
-- Name: usuarios_panel usuarios_panel_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_panel
    ADD CONSTRAINT usuarios_panel_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);


--
-- Name: usuarios_roles usuarios_roles_otorgado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_otorgado_por_fkey FOREIGN KEY (otorgado_por) REFERENCES public.usuarios_panel(id);


--
-- Name: usuarios_roles usuarios_roles_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id);


--
-- Name: usuarios_roles usuarios_roles_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: usuarios_roles usuarios_roles_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios_panel(id);


--
-- Name: evidencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evidencia ENABLE ROW LEVEL SECURITY;

--
-- Name: tanqueos_ocr; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tanqueos_ocr ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict AHEAyEZHFt4yCLkDtzYZ12mqEFCQIINfPElPnq6Jdxqa2LeaYpau0N6cMQr8aNX

