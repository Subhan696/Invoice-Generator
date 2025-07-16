const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'public', 'uploads') });
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));

const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Registration endpoint
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const hashed = await bcrypt.hash(password, 10);
  users.push({ username, password: hashed });
  saveUsers(users);
  req.session.user = { username };
  res.json({ success: true });
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Invalid credentials' });
  req.session.user = { username };
  res.json({ success: true });
});

// Serve login page for unauthenticated users
app.get('/', (req, res, next) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static files (must come after the above route)
app.use(express.static('public'));

// Redirect /logout to login page after logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Helper to get and increment invoice number
function getNextInvoiceNumber() {
  const numberFile = path.join(__dirname, 'invoice_number.txt');
  let number = 1;
  if (fs.existsSync(numberFile)) {
    number = parseInt(fs.readFileSync(numberFile, 'utf8'), 10) + 1;
  }
  fs.writeFileSync(numberFile, number.toString());
  return number;
}

// Protect invoice route
app.post('/invoice', requireAuth, upload.single('logo'), (req, res) => {
  const { client, clientAddress, clientEmail, clientPhone, items, companyName, companyAddress, companyContact, taxRate, discount, paymentTerms, notes, invoiceDate, currency } = req.body;
  const curr = currency || '$';
  const invoiceNumber = getNextInvoiceNumber();
  const doc = new PDFDocument();
  const filename = `invoice_${invoiceNumber}.pdf`;
  const filePath = path.join(__dirname, 'public', filename);

  doc.pipe(fs.createWriteStream(filePath));

  // --- Company Info Block ---
  let logoHeight = 0;
  if (req.file) {
    const logoPath = path.join(__dirname, 'public', 'uploads', req.file.filename);
    try {
      doc.image(logoPath, 50, 50, { width: 80 });
      logoHeight = 80; // approximate height
    } catch (e) {}
  }
  // Company name/address/contact to the right of logo
  const infoTop = 50;
  const infoLeft = 140;
  doc.fontSize(18).font('Helvetica-Bold').text(companyName || '', infoLeft, infoTop, { align: 'left' });
  doc.fontSize(10).font('Helvetica').text((companyAddress || '') + (companyContact ? ' | ' + companyContact : ''), infoLeft, infoTop + 22, { align: 'left' });
  // Move below logo or company info, whichever is lower
  let afterHeaderY = Math.max(infoTop + 40, infoTop + logoHeight);
  // --- Invoice Title and Meta ---
  doc.fontSize(20).font('Helvetica-Bold').text('Invoice', 50, afterHeaderY + 20, { align: 'left' });
  const dateStr = invoiceDate ? new Date(invoiceDate).toLocaleDateString() : new Date().toLocaleDateString();
  doc.fontSize(12).font('Helvetica').text(`Invoice #: ${invoiceNumber}`, 400, afterHeaderY + 20, { align: 'left' });
  doc.text(`Date: ${dateStr}`, 400, afterHeaderY + 38, { align: 'left' });
  doc.moveDown(2);

  // --- Client Info ---
  doc.fontSize(14).font('Helvetica-Bold').text(`Bill To:`, 50, doc.y);
  doc.fontSize(12).font('Helvetica').text(client || '', 60, doc.y);
  if (clientAddress) doc.text(`Address: ${clientAddress}`, 60, doc.y);
  if (clientEmail) doc.text(`Email: ${clientEmail}`, 60, doc.y);
  if (clientPhone) doc.text(`Phone: ${clientPhone}`, 60, doc.y);
  doc.moveDown();

  // --- Items Table ---
  const tableTop = doc.y + 10;
  const colX = [50, 180, 320, 380, 460];
  doc.fontSize(12).font('Helvetica-Bold');
  doc.text('Item', colX[0], tableTop);
  doc.text('Description', colX[1], tableTop);
  doc.text('Qty', colX[2], tableTop, { width: 40, align: 'right' });
  doc.text('Unit Price', colX[3], tableTop, { width: 70, align: 'right' });
  doc.text('Total', colX[4], tableTop, { width: 70, align: 'right' });
  // Draw header line
  doc.moveTo(colX[0], tableTop + 18).lineTo(540, tableTop + 18).stroke();
  doc.fontSize(12).font('Helvetica');
  let y = tableTop + 24;
  let subtotal = 0;
  let itemsArr = [];
  try {
    itemsArr = typeof items === 'string' ? JSON.parse(items) : items;
  } catch (e) { itemsArr = []; }
  itemsArr.forEach((item) => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const lineTotal = qty * unitPrice;
    doc.text(item.name, colX[0], y);
    doc.text(item.description || '', colX[1], y);
    doc.text(qty.toString(), colX[2], y, { width: 40, align: 'right' });
    doc.text(unitPrice.toFixed(2), colX[3], y, { width: 70, align: 'right' });
    doc.text(lineTotal.toFixed(2), colX[4], y, { width: 70, align: 'right' });
    y += 20;
    subtotal += lineTotal;
  });
  // Draw table bottom line
  doc.moveTo(colX[0], y).lineTo(540, y).stroke();
  doc.moveDown(2);

  // --- Totals ---
  const tax = subtotal * ((Number(taxRate) || 0) / 100);
  const discountVal = Number(discount) || 0;
  const grandTotal = subtotal + tax - discountVal;
  doc.fontSize(12).font('Helvetica');
  doc.text(`Subtotal: ${curr}${subtotal.toFixed(2)}`, 400, y + 10, { align: 'right' });
  doc.text(`Tax (${taxRate || 0}%): ${curr}${tax.toFixed(2)}`, 400, y + 30, { align: 'right' });
  doc.text(`Discount: -${curr}${discountVal.toFixed(2)}`, 400, y + 50, { align: 'right' });
  doc.fontSize(14).font('Helvetica-Bold').text(`Grand Total: ${curr}${grandTotal.toFixed(2)}`, 400, y + 70, { align: 'right' });
  doc.moveDown(2);

  // --- Payment Terms & Notes ---
  if (paymentTerms) {
    doc.fontSize(12).font('Helvetica').text(`Payment Terms: ${paymentTerms}`);
  }
  if (notes) {
    doc.fontSize(12).font('Helvetica').text(`Notes: ${notes}`);
  }

  doc.end();

  let responded = false;
  function sendResponse() {
    if (!responded) {
      responded = true;
      console.log('Sending response:', { url: `/${filename}` });
      res.json({ url: `/${filename}` });
    }
  }

  doc.on('finish', sendResponse);
  doc.on('error', (err) => {
    console.error('PDFKit error:', err);
    if (!responded) {
      responded = true;
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });
  // Fallback: send response after 2 seconds if not already sent
  setTimeout(sendResponse, 2000);
});

// Email sending endpoint
app.post('/send-invoice-email', async (req, res) => {
  const { filename, clientEmail } = req.body;
  if (!filename || !clientEmail) {
    return res.status(400).json({ error: 'Missing filename or client email' });
  }
  const filePath = path.join(__dirname, 'public', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Invoice file not found' });
  }
  try {
    // Use Ethereal for test emails (replace with real SMTP for production)
    let testAccount = await nodemailer.createTestAccount();
    let transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    let info = await transporter.sendMail({
      from: 'Invoice Generator <no-reply@example.com>',
      to: clientEmail,
      subject: 'Your Invoice',
      text: 'Please find your invoice attached.',
      attachments: [
        {
          filename,
          path: filePath
        }
      ]
    });
    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    res.json({ success: true, previewUrl: nodemailer.getTestMessageUrl(info) });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)); 