// Codes d'Extraction de Fichiers
// Pour n8n - Node "Code"

// ============================================================
// 1. EXTRACTION PDF - pdf-parse
// ============================================================

const extractPDF = `
// Node: Code - Extraction PDF
// Nécessite: npm install pdf-parse

const pdfParse = require('pdf-parse');

// Récupérer le buffer du fichier
const fileBuffer = $input.first().json.fileBuffer;

// Options d'extraction
const options = {
  max: 0, // 0 = pas de limite de pages
  version: 'v1.10.100'
};

// Parser le PDF
pdfParse(fileBuffer, options)
  .then(data => {
    return [{
      json: {
        success: true,
        text: data.text,
        numPages: data.numpages,
        info: data.info,
        metadata: data.metadata,
        version: data.version,
        extracted_at: new Date().toISOString()
      }
    }];
  })
  .catch(error => {
    return [{
      json: {
        success: false,
        error: error.message,
        error_type: 'pdf_extraction_failed'
      }
    }];
  });
`;

// ============================================================
// 2. EXTRACTION EXCEL - xlsx.js
// ============================================================

const extractExcel = `
// Node: Code - Extraction Excel (XLSX/XLS)
// Nécessite: npm install xlsx

const XLSX = require('xlsx');

// Récupérer le buffer du fichier
const fileBuffer = $input.first().json.fileBuffer;

// Lire le workbook
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

// Résultats
const result = {
  success: true,
  sheetNames: workbook.SheetNames,
  sheets: {},
  summary: {}
};

// Extraire chaque feuille
workbook.SheetNames.forEach(sheetName => {
  const worksheet = workbook.Sheets[sheetName];

  // Convertir en JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1, // Première ligne comme headers
    defval: null, // Valeur par défaut pour cellules vides
    blankrows: false // Ignorer lignes vides
  });

  // Statistiques de la feuille
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  result.sheets[sheetName] = {
    data: jsonData,
    rowCount: jsonData.length,
    colCount: jsonData[0] ? jsonData[0].length : 0,
    headers: jsonData[0] || [],
    range: worksheet['!ref']
  };
});

// Résumé global
result.summary = {
  totalSheets: workbook.SheetNames.length,
  totalRows: Object.values(result.sheets).reduce((sum, s) => sum + s.rowCount, 0),
  extracted_at: new Date().toISOString()
};

return [result];
`;

// ============================================================
// 3. EXTRACTION WORD - mammoth
// ============================================================

const extractWord = `
// Node: Code - Extraction DOCX
// Nécessite: npm install mammoth

const mammoth = require('mammoth');

// Récupérer le buffer du fichier
const fileBuffer = $input.first().json.fileBuffer;

// Options d'extraction
const options = {
  // Convertir en markdown pour garder la structure
  convertImage: mammoth.images.imgElement(function(image) {
    return image.read("base64").then(function(imageBuffer) {
      return {
        src: "data:" + image.contentType + ";base64," + imageBuffer
      };
    });
  })
};

// Extraire le texte
mammoth.extractRawText({ buffer: fileBuffer })
  .then(result => {
    return [{
      json: {
        success: true,
        text: result.value,
        messages: result.messages, // Avertissements éventuels
        extracted_at: new Date().toISOString()
      }
    }];
  })
  .catch(error => {
    return [{
      json: {
        success: false,
        error: error.message,
        error_type: 'docx_extraction_failed'
      }
    }];
  });
`;

// ============================================================
// 4. EXTRACTION CSV - Natif Node.js
// ============================================================

const extractCSV = `
// Node: Code - Extraction CSV
// Pas de dépendance externe requise

const fs = require('fs');

// Récupérer le contenu (si buffer, le convertir)
let csvContent;
if (Buffer.isBuffer($input.first().json.fileBuffer)) {
  csvContent = $input.first().json.fileBuffer.toString('utf-8');
} else {
  csvContent = $input.first().json.fileBuffer;
}

// Fonction de parsing CSV simple
function parseCSV(content, delimiter = ',') {
  const lines = content.split('\\n').filter(line => line.trim());

  if (lines.length === 0) {
    return { headers: [], data: [] };
  }

  // Détection automatique du délimiteur
  const firstLine = lines[0];
  if (firstLine.includes(';') && !firstLine.includes(',')) {
    delimiter = ';';
  } else if (firstLine.includes('\\t')) {
    delimiter = '\\t';
  }

  // Parser les lignes
  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const data = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] !== undefined ? values[i] : null;
    });
    return row;
  }).filter(row => Object.values(row).some(v => v !== null && v !== ''));

  return { headers, data, delimiter, rowCount: data.length };
}

// Parser le CSV
const parsed = parseCSV(csvContent);

// Convertir pour Grok (format compatible)
const jsonData = {
  headers: parsed.headers,
  rows: parsed.data.slice(0, 1000), // Limiter à 1000 lignes pour l'API
  totalRows: parsed.rowCount,
  delimiter: parsed.delimiter,
  sample: parsed.data.slice(0, 5) // 5 premières lignes
};

return [{
  json: {
    success: true,
    data: jsonData,
    extracted_at: new Date().toISOString()
  }
}];
`;

// ============================================================
// 5. ROUTEUR DE TYPE DE FICHIER
// ============================================================

const fileTypeRouter = `
// Node: Code - Détection et routage du type de fichier

const fileType = $input.first().json.fileType || '';
const fileName = $input.first().json.fileName || '';
const mimeType = $input.first().json.mimeType || '';

// Détection du type réel
let detectedType = 'unknown';

if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
  detectedType = 'pdf';
} else if (
  mimeType.includes('excel') ||
  mimeType.includes('spreadsheet') ||
  fileName.match(/\\.(xlsx?|xlsm|xlsb)$/i)
) {
  detectedType = 'excel';
} else if (
  mimeType.includes('word') ||
  mimeType.includes('document') ||
  fileName.match(/\\.docx?$/i)
) {
  detectedType = 'word';
} else if (
  mimeType.includes('csv') ||
  mimeType.includes('text/csv') ||
  fileName.endsWith('.csv')
) {
  detectedType = 'csv';
}

// Retourner avec le type détecté
return [{
  json: {
    detectedType: detectedType,
    fileType: fileType,
    fileName: fileName,
    mimeType: mimeType,
    isSupported: ['pdf', 'excel', 'word', 'csv'].includes(detectedType),
    routing: {
      pdf: detectedType === 'pdf',
      excel: detectedType === 'excel',
      word: detectedType === 'word',
      csv: detectedType === 'csv'
    }
  }
}];
`;

// ============================================================
// 6. PRÉPARATION DES DONNÉES POUR GROK
// ============================================================

const prepareForGrok = `
// Node: Code - Préparer les données extraites pour l'API Grok

const extractedData = $input.first().json;
const detectedType = extractedData.detectedType || 'unknown';

let dataForGrok = {
  type: detectedType,
  timestamp: new Date().toISOString(),
  ready: false
};

switch (detectedType) {
  case 'pdf':
    if (extractedData.success && extractedData.text) {
      // Limiter le texte à ~3000 tokens pour l'API
      const maxChars = 12000;
      const text = extractedData.text;
      dataForGrok = {
        ...dataForGrok,
        ready: true,
        text: text.length > maxChars ? text.substring(0, maxChars) + '\\n...[tronqué]' : text,
        numPages: extractedData.numPages,
        isTruncated: text.length > maxChars,
        originalLength: text.length
      };
    }
    break;

  case 'excel':
    if (extractedData.sheets) {
      // Prendre la première feuille avec des données
      const firstSheet = Object.values(extractedData.sheets)[0];
      if (firstSheet && firstSheet.data) {
        // Convertir en format JSON pour Grok
        const headers = firstSheet.headers;
        const rows = firstSheet.data.slice(1, 101); // Limiter à 100 lignes

        const jsonData = rows.map(row => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row[i];
          });
          return obj;
        });

        dataForGrok = {
          ...dataForGrok,
          ready: true,
          sheetName: Object.keys(extractedData.sheets)[0],
          columns: headers,
          data: jsonData,
          totalRows: firstSheet.rowCount - 1,
          isSample: firstSheet.rowCount > 101
        };
      }
    }
    break;

  case 'word':
    if (extractedData.success && extractedData.text) {
      const maxChars = 12000;
      const text = extractedData.text;
      dataForGrok = {
        ...dataForGrok,
        ready: true,
        text: text.length > maxChars ? text.substring(0, maxChars) + '\\n...[tronqué]' : text,
        isTruncated: text.length > maxChars,
        originalLength: text.length
      };
    }
    break;

  case 'csv':
    if (extractedData.data) {
      dataForGrok = {
        ...dataForGrok,
        ready: true,
        columns: extractedData.data.headers,
        data: extractedData.data.rows.slice(0, 100),
        totalRows: extractedData.data.totalRows,
        delimiter: extractedData.data.delimiter,
        isSample: extractedData.data.totalRows > 100
      };
    }
    break;

  default:
    dataForGrok.error = 'Type de fichier non supporté';
}

return [{
  json: dataForGrok
}];
`;

// ============================================================
// 7. UTILITAIRE - CHUNKING POUR DOCUMENTS LONGS
// ============================================================

const chunkDocument = `
// Node: Code - Découper un document long en chunks

const text = $input.first().json.text || '';
const maxChunkSize = $input.first().json.maxChunkSize || 3000; // environ 3000 caractères

// Découper par paragraphes pour garder le contexte
function chunkText(content, maxSize) {
  const chunks = [];
  const paragraphs = content.split('\\n\\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\\n\\n' : '') + paragraph;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

const chunks = chunkText(text, maxChunkSize);

return chunks.map((chunk, index) => ({
  json: {
    chunkIndex: index + 1,
    totalChunks: chunks.length,
    text: chunk,
    charCount: chunk.length
  }
}));
`;

// ============================================================
// 8. INSTALLATION DES DÉPENDANCES (Docker n8n)
// ============================================================

const dockerInstructions = `
# Dockerfile pour n8n avec dépendances d'extraction

FROM n8nio/n8n:latest

# Installer les packages Node.js nécessaires
USER root

RUN npm install -g \
  pdf-parse \
  xlsx \
  mammoth

# Retourner à l'utilisateur node
USER node

# Le conteneur démarre normalement
`;

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  extractPDF,
  extractExcel,
  extractWord,
  extractCSV,
  fileTypeRouter,
  prepareForGrok,
  chunkDocument,
  dockerInstructions
};

// Instructions d'utilisation dans n8n:
// 1. Créer un node "Code"
// 2. Coller le code correspondant au type de fichier
// 3. Ajuster les variables d'entrée selon votre workflow
// 4. Tester avec des fichiers de test
