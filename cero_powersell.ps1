# =============================================================================
# CERO - PowerSell / Dump de contexto tecnico (PowerShell - Windows)
# Estructura basada en ARCHITECTURE.md v26 (19/04/2026)
#
# Uso:
#   .\cero_powersell.ps1 -Modo whatsapp    # Flujo WhatsApp completo
#   .\cero_powersell.ps1 -Modo comercial   # Documento de ventas
#   .\cero_powersell.ps1 -Modo full        # Todo junto
#
# Corre desde la raíz del repo CERO.
# =============================================================================

param(
    [string]$Modo = "whatsapp"
)

$Fecha   = Get-Date -Format "yyyyMMdd_HHmm"
$Output  = "CERO_dump_${Modo}_${Fecha}.txt"
$Sep     = "=" * 80

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Agregar-Archivo {
    param([string]$Ruta)
    if (Test-Path -LiteralPath $Ruta) {
        $contenido = Get-Content -LiteralPath $Ruta -Encoding UTF8
        $Lineas = $contenido.Count
        Add-Content -LiteralPath $Output -Encoding UTF8 -Value ""
        Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
        Add-Content -LiteralPath $Output -Encoding UTF8 -Value "ARCHIVO: $Ruta  |  LINEAS: $Lineas"
        Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
        Add-Content -LiteralPath $Output -Encoding UTF8 -Value ""
        $contenido | Add-Content -LiteralPath $Output -Encoding UTF8
        Add-Content -LiteralPath $Output -Encoding UTF8 -Value ""
        Write-Host "  ok  $Ruta" -ForegroundColor Green
    } else {
        Write-Host "  --  $Ruta" -ForegroundColor Yellow
    }
}

function Agregar-Dir {
    param([string]$Dir, [string]$Ext = "js")
    if (Test-Path $Dir) {
        Get-ChildItem -Path $Dir -Filter "*.$Ext" -File | Sort-Object Name | ForEach-Object {
            Agregar-Archivo $_.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
        }
    } else {
        Write-Host "  -- dir no encontrado: $Dir" -ForegroundColor Yellow
    }
}

function Cabecera {
    param([string]$Titulo)
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value ""
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value ">>> $Titulo"
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
    Write-Host ""
    Write-Host ">>> $Titulo" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Obtener info git
# ---------------------------------------------------------------------------
try {
    $GitRama   = git branch --show-current 2>$null
    $GitCommit = git log -1 --oneline 2>$null
} catch {
    $GitRama   = "N/A"
    $GitCommit = "N/A"
}

# ---------------------------------------------------------------------------
# Inicializar archivo de salida
# ---------------------------------------------------------------------------
Write-Host "CERO PowerSell - $Modo" -ForegroundColor Green
Write-Host "Salida: $Output"
Write-Host ""

Set-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
Add-Content -LiteralPath $Output -Encoding UTF8 -Value "CERO - Dump tecnico / PowerSell"
Add-Content -LiteralPath $Output -Encoding UTF8 -Value "Fecha:         $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Add-Content -LiteralPath $Output -Encoding UTF8 -Value "Modo:          $Modo"
Add-Content -LiteralPath $Output -Encoding UTF8 -Value "Directorio:    $(Get-Location)"
Add-Content -LiteralPath $Output -Encoding UTF8 -Value "Rama git:      $GitRama"
Add-Content -LiteralPath $Output -Encoding UTF8 -Value "Ultimo commit: $GitCommit"
Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep

# ===========================================================================
# MODO whatsapp
# ===========================================================================
function Dump-Whatsapp {

    Cabecera "ENTRYPOINT + RUTAS"
    Agregar-Archivo "index.js"
    Agregar-Dir "rutas"

    Cabecera "CANAL WHATSAPP"
    Agregar-Archivo "canales/whatsapp.js"

    Cabecera "COMPARTIDO - baseFlujo + utilidades"
    Agregar-Archivo "modulos/inspecciones/compartido/baseFlujo.js"
    Agregar-Archivo "modulos/inspecciones/compartido/twiml.js"
    Agregar-Archivo "modulos/inspecciones/compartido/iniciadorFlujo.js"
    Agregar-Archivo "modulos/inspecciones/compartido/kilometraje.js"
    Agregar-Archivo "modulos/inspecciones/compartido/navegacion.js"
    Agregar-Archivo "modulos/inspecciones/compartido/validacionVisual.js"

    Cabecera "MODULO - PREOPERACIONAL"
    Agregar-Dir "modulos/inspecciones/preoperacional"

    Cabecera "MODULO - POSOPERACIONAL"
    Agregar-Dir "modulos/inspecciones/posoperacional"

    Cabecera "MODULO - TANQUEO"
    Agregar-Dir "modulos/tanqueo"

    Cabecera "MODULO - INSCRIPCION"
    Agregar-Dir "modulos/inscripcion"

    Cabecera "MODULO - ALERTAS"
    Agregar-Dir "modulos/alertas"

    Cabecera "SERVICIOS"
    Agregar-Archivo "servicios/sesiones.js"
    Agregar-Archivo "servicios/ocr.js"
    Agregar-Archivo "servicios/storage.js"
    Agregar-Archivo "servicios/plantillas.js"
    Agregar-Archivo "servicios/passwords.js"
    Agregar-Archivo "servicios/logo.js"

    Cabecera "SERVICIOS - PDF"
    Agregar-Archivo "servicios/pdf/base.js"
    Agregar-Archivo "servicios/pdf/GeneradorPDFBase.js"
    Agregar-Archivo "servicios/pdf/GeneradorPDFPreoperacional.js"
    Agregar-Archivo "servicios/pdf/GeneradorPDFPosoperacional.js"
    Agregar-Archivo "servicios/pdf/preoperacional.js"
    Agregar-Archivo "servicios/pdf/posoperacional.js"

    Cabecera "DATA - Capa de acceso a base de datos"
    Agregar-Archivo "data/activos.js"
    Agregar-Archivo "data/inspecciones.js"
    Agregar-Archivo "data/tanqueos.js"
    Agregar-Archivo "data/posoperacionales.js"
    Agregar-Archivo "data/autorizaciones.js"
    Agregar-Archivo "data/alertas.js"
    Agregar-Archivo "data/plantillas.js"
    Agregar-Archivo "data/conductores.js"
    Agregar-Archivo "data/dashboard.js"
    Agregar-Archivo "data/permisos.js"

    Cabecera "CONFIGURACION"
    Agregar-Archivo "config/config.js"

    Cabecera "MIDDLEWARES"
    Agregar-Archivo "middlewares/auth.js"
}

# ===========================================================================
# MODO comercial
# ===========================================================================
function Dump-Comercial {
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value ""
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value "CERO - Propuesta comercial"
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value $Sep
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value ""
    Add-Content -LiteralPath $Output -Encoding UTF8 -Value @"
PROPUESTA DE VALOR
==================
CERO digitaliza las operaciones de campo de flotas vehiculares en Colombia,
cumpliendo con la resolucion PESV 40595/2022.

El conductor opera solo por WhatsApp. Sin apps. Sin capacitacion especial.
El supervisor gestiona desde un panel web en tiempo real.
La empresa obtiene trazabilidad, PDFs con firma digital y control de novedades.

FUNCIONALIDADES ACTIVAS
========================
  Preoperacional    20 items, 4 bloques, plantillas dinamicas por tipo de activo
  Posoperacional    Novedades al cierre de turno con PDF
  Tanqueo           OCR de factura con validacion cruzada antifraude
  Alertas           SOAT / tecno / licencias - semaforo 30/15/7 dias + cron 6AM
  Inscripcion       Primer mensaje = registro automatico del conductor
  Autorizacion      AUTORIZAR / TALLER / RESTRINGIR por WhatsApp con trazabilidad
  PDF               Firma digital, evidencia legal por inspeccion
  Panel web         Flota, preop, posop, tanqueos, conductores, alertas, sedes, usuarios
  Bloqueo           Activo no sale sin decision del supervisor

ARQUITECTURA
============
  Backend:    Node.js 20 + Express - CommonJS
  Base datos: Supabase PostgreSQL + Storage (Sao Paulo)
  Despliegue: Railway - auto-deploy desde GitHub rama desarrollo
  Mensajeria: Twilio WhatsApp Business API
  IA:         Google Gemini 2.0 Flash - OCR placas, odometros, facturas
  Frontend:   HTML + CSS + JS vanilla
  Auth:       JWT + bcrypt - 8h expiracion
  Modelo:     Multi-empresa / multi-sede / multi-rol

CUMPLIMIENTO PESV - Resolucion 40595/2022
==========================================
  Registro de inspecciones preoperacionales (obligatorio)
  Trazabilidad conductor + activo + fecha + firma digital
  Control de documentos vehiculares y de conductores
  Registro de novedades y decisiones de supervision
  Evidencia PDF para auditorias
  Restricciones operativas por novedades criticas
  Alertas automaticas de vencimiento

MODELO COMERCIAL
================
  SaaS mensual por empresa / sede
  Modulos base: preoperacional, posoperacional, tanqueo, alertas
  Modulos adicionales: dashboard avanzado, Power BI, seguridad personal (Fase 3)

  Empresa: dialk S.A.S. (en constitucion)
  Producto: CERO - cero papel, cero accidentes
"@
    Write-Host "  ok  Seccion comercial" -ForegroundColor Green
}

# Copia estable con nombre fijo (flujo WhatsApp incluido en full)
function Copiar-DumpEstable {
    if ($Modo -eq "whatsapp" -or $Modo -eq "full") {
        $dest = Join-Path (Get-Location) "CERO_dump_whatsapp.txt"
        Copy-Item -LiteralPath $Output -Destination $dest -Force
        Write-Host ""
        Write-Host "Copia estable: CERO_dump_whatsapp.txt" -ForegroundColor Cyan
    }
}

# ===========================================================================
# Ejecutar
# ===========================================================================
switch ($Modo) {
    "whatsapp" { Dump-Whatsapp }
    "comercial" { Dump-Comercial }
    "full"     { Dump-Comercial; Dump-Whatsapp }
    default    {
        Write-Host "Modo desconocido: $Modo" -ForegroundColor Red
        Write-Host "Uso: .\cero_powersell.ps1 -Modo [whatsapp|comercial|full]"
        exit 1
    }
}

Copiar-DumpEstable

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
$Lineas  = (Get-Content -LiteralPath $Output -Encoding UTF8).Count
$Tamanio = [math]::Round((Get-Item -LiteralPath $Output).Length / 1KB, 1)

Write-Host ""
Write-Host $Sep -ForegroundColor Green
Write-Host "  Archivo: $Output"
Write-Host "  Lineas:  $Lineas"
Write-Host "  Tamanio: ${Tamanio} KB"
Write-Host $Sep -ForegroundColor Green
