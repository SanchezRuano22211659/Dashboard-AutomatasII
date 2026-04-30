import express from "express";
import multer from "multer";
import path from "path";
import { parseInput } from "../sintactico.js";
import { analyzeSemantics, cstToFields } from "../semantico.js";

const router = express.Router();

let pool;

export function setPool(pgPool) {
    pool = pgPool;
}

// Configuración de multer para recibir archivos .dext en memoria
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== ".dext") {
            return cb(new Error("Solo se permiten archivos con extensión .dext"));
        }
        cb(null, true);
    },
});

// Formato .dext: múltiples objetos de sensor separados por líneas en blanco
// Cada bloque sigue la misma gramática que el compilador ya valida
// Ejemplo de archivo .dext:
//
// {
//   sensor: DHT22,
//   zona: "Revision 1",
//   Temperatura: 5,
//   Humedad: 75,
//   Estado: Normal
// }
//
// {
//   Sensor: "Radar Doppler",
//   Zona: "Carril 1",
//   Velocidad_kmh: 30,
//   Direccion: Norte,
//   Estado: Normal
// }

// Divide el contenido del archivo en bloques individuales de sensor
function extraerBloques(contenido) {
    const bloques = [];
    let profundidad = 0;
    let inicio = -1;

    for (let i = 0; i < contenido.length; i++) {
        if (contenido[i] === "{") {
            if (profundidad === 0) inicio = i;
            profundidad++;
        } else if (contenido[i] === "}") {
            profundidad--;
            if (profundidad === 0 && inicio !== -1) {
                bloques.push(contenido.slice(inicio, i + 1).trim());
                inicio = -1;
            }
        }
    }

    return bloques;
}

// Determina el tipo de sensor según el nombre para almacenarlo en BD
function inferirTipoSensor(sensorName) {
    if (!sensorName) return null;

    const mapa = {
        "_Bascula":        "bascula",
        "DEXA_RX":         "dexa",
        "DHT22":           "dht22",
        "FLIR TERMICA":    "flir",
        "LPR":             "lpr",
        "MQ-135":          "mq135",
        "Radar Doppler":   "radar",
        "RFID UHF Reader": "rfid",
        "Sensor PIR":      "pir",
        "SONOMETRO":       "sonometro",
    };

    return mapa[sensorName] || null;
}

// POST /api/dext/analizar-debug
// Procesa texto plano y devuelve información de todas las etapas
router.post("/analizar-debug", async (req, res) => {
    const { contenido } = req.body;
    if (!contenido) return res.status(400).json({ error: "No hay contenido" });

    try {
        const bloques = extraerBloques(contenido);
        const bloqueAProcesar = bloques[0] || contenido;

        const parseResult = parseInput(bloqueAProcesar) || {};
        
        let fields = {};
        let semantic = { valid: true, errors: [], warnings: [] };

        // Corregido: Verificar si el array de errores está vacío o no existe
        const tieneErroresLex = parseResult.lexErrors && parseResult.lexErrors.length > 0;
        const tieneErroresSin = parseResult.parseErrors && parseResult.parseErrors.length > 0;

        if (!tieneErroresLex && !tieneErroresSin && parseResult.cst) {
            fields = cstToFields(parseResult.cst);
            semantic = analyzeSemantics(fields);
        }

        const errores = [
            ...(parseResult.lexErrors?.map(e => `Léxico: ${e.message}`) || []),
            ...(parseResult.parseErrors?.map(e => `Sintáctico: ${e.message}`) || []),
            ...(semantic.errors?.map(e => `Semántico: ${e}`) || [])
        ];

        return res.json({
            lexico: (parseResult.tokens || []).map(t => ({
                name: t.tokenType?.name || "TOKEN",
                image: t.image,
                startLine: t.startLine,
                startColumn: t.startColumn
            })),
            sintactico: parseResult.cst || {},
            semantico: fields,
            errores: errores,
            advertencias: semantic.warnings || []
        });
    } catch (err) {
        console.error("Error en analizar-debug:", err);
        return res.status(500).json({ error: "Error interno al procesar el código: " + err.message });
    }
});

// POST /api/dext/procesar
// Recibe un archivo .dext, lo valida bloque a bloque con el compilador
// y persiste las lecturas válidas en la BD
router.post("/procesar", upload.single("archivo"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Se requiere un archivo .dext." });
    }

    const contenido = req.file.buffer.toString("utf-8");
    const nombreArchivo = req.file.originalname;
    const usuarioId = req.usuario?.id || null;

    const bloques = extraerBloques(contenido);

    if (bloques.length === 0) {
        return res.status(422).json({ error: "El archivo no contiene bloques válidos." });
    }

    const resultados = [];
    let validos = 0;
    let invalidos = 0;
    const idsInsertados = [];

    for (let i = 0; i < bloques.length; i++) {
        const bloque = bloques[i];
        const entrada = { indice: i + 1, bloque };

        // Análisis léxico y sintáctico
        const parseResult = parseInput(bloque);

        if (parseResult.lexErrors) {
            invalidos++;
            resultados.push({ ...entrada, etapa: "lexico", errores: parseResult.lexErrors, valido: false });
            continue;
        }

        if (parseResult.parseErrors) {
            invalidos++;
            resultados.push({ ...entrada, etapa: "sintactico", errores: parseResult.parseErrors, valido: false });
            continue;
        }

        // Análisis semántico
        const fields = cstToFields(parseResult.cst);
        const semantic = analyzeSemantics(fields);

        if (!semantic.valid) {
            invalidos++;
            resultados.push({
                ...entrada,
                etapa: "semantico",
                sensor: semantic.sensorName,
                errores: semantic.errors,
                advertencias: semantic.warnings,
                valido: false,
            });
            continue;
        }

        // Persistir lectura válida
        try {
            const dbResult = await pool.query(
                `INSERT INTO lecturas (sensor, tipo_sensor, zona, datos, advertencias, fuente)
                 VALUES ($1, $2, $3, $4, $5, 'dext')
                 RETURNING id, created_at`,
                [
                    semantic.sensorName,
                    inferirTipoSensor(semantic.sensorName),
                    fields.zona || fields.Zona || null,
                    JSON.stringify(fields),
                    JSON.stringify(semantic.warnings),
                ]
            );

            validos++;
            idsInsertados.push(dbResult.rows[0].id);
            resultados.push({
                ...entrada,
                sensor: semantic.sensorName,
                id: dbResult.rows[0].id,
                advertencias: semantic.warnings,
                valido: true,
            });
        } catch (dbErr) {
            invalidos++;
            resultados.push({
                ...entrada,
                etapa: "base_de_datos",
                errores: [dbErr.message],
                valido: false,
            });
        }
    }

    // Registrar el archivo procesado en la tabla archivos_dext
    try {
        await pool.query(
            `INSERT INTO archivos_dext (nombre, contenido, total, validos, invalidos, procesado_por)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [nombreArchivo, contenido, bloques.length, validos, invalidos, usuarioId]
        );
    } catch (err) {
        console.error("Error registrando archivo dext:", err.message);
    }

    return res.status(200).json({
        archivo: nombreArchivo,
        total: bloques.length,
        validos,
        invalidos,
        ids_insertados: idsInsertados,
        resultados,
    });
});

// GET /api/dext/historial
// Devuelve el historial de archivos .dext procesados
router.get("/historial", async (req, res) => {
    const { limit = 20 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    try {
        const result = await pool.query(
            `SELECT d.id, d.nombre, d.total, d.validos, d.invalidos, d.created_at,
                    u.username AS procesado_por
             FROM archivos_dext d
             LEFT JOIN usuarios u ON u.id = d.procesado_por
             ORDER BY d.created_at DESC
             LIMIT $1`,
            [limitNum]
        );
        return res.json(result.rows);
    } catch (err) {
        console.error("Error consultando historial dext:", err.message);
        return res.status(500).json({ error: "Error interno." });
    }
});

export default router;
