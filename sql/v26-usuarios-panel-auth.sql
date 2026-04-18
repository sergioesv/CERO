-- ═══════════════════════════════════════════════════════════
-- v26 — Usuarios panel: columnas auditoria y flujo password
-- Fecha: 17/04/2026
-- ═══════════════════════════════════════════════════════════

-- 1. Flag para forzar cambio de contrasena en primer login
ALTER TABLE usuarios_panel
  ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

-- 2. Auditoria: quien creo este usuario
ALTER TABLE usuarios_panel
  ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuarios_panel(id) ON DELETE SET NULL;

-- 3. Auditoria: timestamp de ultima modificacion
ALTER TABLE usuarios_panel
  ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 4. Indice unico de email case-insensitive (evita duplicados por mayusculas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_panel_email_lower
  ON usuarios_panel (LOWER(email));

-- 5. Verificacion: debe mostrar 12 columnas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios_panel'
ORDER BY ordinal_position;

-- Fin v26
