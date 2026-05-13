import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';
import {
  rotatePDFIfNeeded,
  convertFirstPageToImage,
  runFullPDFOCR,
  smartPDFProcess,
  optimizePDF,
  extractFirstPageAsPDF,
} from './utils/ocr.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ dest: 'temp/' });
app.use(express.json());

app.get('/', (req, res) => {
  const hostname = os.hostname();
  console.log(`OCR microservice running on ${hostname}`);
  res.send(`OCR microservice running on ${hostname}`);
});

app.post('/ocr', upload.single('file'), async (req, res) => {
  const callbackUrl = req.body.callbackUrl;
  const id = uuidv4();
  const tempDir = path.join(__dirname, 'temp');
  const originalPath = path.join(tempDir, req.file.filename);
  const rotatedPdfPath = path.join(tempDir, `${id}-rotated.pdf`);
  const imagePrefix = path.join(tempDir, id);

  const hostname = os.hostname();
  console.log(`🚀 OCR microservice running on ${hostname}`);
  console.log('📩 Received OCR job:', req.file.originalname);
  res.status(202).json({ message: 'OCR started', id, hostname });

  try {
    const correctedPdf = await rotatePDFIfNeeded(originalPath, rotatedPdfPath);
    const imagePath = await convertFirstPageToImage(correctedPdf, imagePrefix);
    //const ocrResult = await runFullPDFOCR(correctedPdf, path.join(tempDir, id));
    const ocrResult = await smartPDFProcess(correctedPdf, path.join(tempDir, id));
    const optimizedPath = path.join(tempDir, `${id}-optimized.pdf`);
    await optimizePDF(ocrResult.pdf, optimizedPath);
    const firstPagePdfPath = path.join(tempDir, `${id}-page1.pdf`);
    await extractFirstPageAsPDF(optimizedPath, firstPagePdfPath);

    // ✅ Prepare multipart/form-data payload
    const form = new FormData();
    form.append('text', ocrResult.text);
    form.append('filename', req.file.originalname || `${id}.pdf`);
    form.append('pdf', fssync.createReadStream(optimizedPath));
    form.append('pdf_page1', fssync.createReadStream(firstPagePdfPath));
    form.append('image', fssync.createReadStream(imagePath));

    if (callbackUrl) {
      console.log('📤 Sending OCR result as multipart to callback:', callbackUrl);
      await axios.post(callbackUrl, form, {
        headers: form.getHeaders()
      });
    } else {
      console.warn('⚠️ No callbackUrl provided — result not sent.');
    }

    console.log('✅ OCR processing and callback complete');
  } catch (error) {
    console.error('[ERROR] OCR failed:', error.message);
    if (callbackUrl) {
      await axios.post(callbackUrl, {
        error: 'OCR failed',
        message: error.message,
        filename: req.file.originalname || `${id}.pdf`
      });
    }
  }
});

app.listen(3000, () => {
  console.log('🚀 OCR microservice listening on port 3000');
  const hostname = os.hostname();
  console.log(`🚀 OCR microservice running on ${hostname}`);
});
