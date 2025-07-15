const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// POST /invoice - Generate PDF and send download link
app.post('/invoice', (req, res) => {
  const { client, items } = req.body;
  const doc = new PDFDocument();
  const filename = `invoice_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'public', filename);

  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(20).text('Invoice', { align: 'center' });
  doc.moveDown();
  // Add invoice date
  const invoiceDate = new Date().toLocaleDateString();
  doc.fontSize(12).text(`Date: ${invoiceDate}`, { align: 'right' });
  doc.moveDown();
  doc.fontSize(14).text(`Client: ${client}`);
  doc.moveDown();

  let total = 0;
  items.forEach((item, idx) => {
    doc.text(`${idx + 1}. ${item.name} - $${item.price}`);
    total += Number(item.price);
  });

  doc.moveDown();
  doc.fontSize(16).text(`Total: $${total}`, { align: 'right' });

  doc.end();

  doc.on('finish', () => {
    res.json({ url: `/${filename}` });
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)); 