# Invoice Generator

A full-stack web application for generating, downloading, and emailing PDF invoices. Includes user authentication, invoice number tracking, and secure email sending via Gmail.

## Features
- User registration and login (with hashed passwords)
- Session-based authentication
- Generate PDF invoices with:
  - Company and client details
  - Itemized table
  - Tax, discount, payment terms, notes
  - Optional company logo upload
- Download generated invoices
- Email invoices as PDF attachments to clients
- Invoice number auto-increment and tracking

## Tech Stack
- **Backend:** Node.js, Express, PDFKit, Nodemailer, bcryptjs, multer, dotenv
- **Frontend:** HTML/CSS/JS (in `public/`)
- **Storage:** JSON files for users and invoice number

## Getting Started

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd "Invoice generator"
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
Create a `.env` file in the project root:
```
EMAIL_USER=youraddress@gmail.com
EMAIL_PASS=your_app_password
```
- Use a Gmail App Password (not your main Gmail password) and enable 2-Step Verification on your Google account.
- `.env` is already in `.gitignore` and will not be committed.

### 4. Start the server
```bash
node server.js
```
Or, for development with auto-reload:
```bash
npx nodemon server.js
```

### 5. Access the app
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage
- Register a new user or log in.
- Fill in invoice details, upload a logo (optional), and add items.
- Generate and download the PDF invoice.
- Use the "Send Email" feature to email the invoice to your client.

## File Structure
- `server.js` — Main backend server
- `public/` — Static frontend files (HTML, CSS, JS, uploads)
- `users.json` — User data (auto-created)
- `invoice_number.txt` — Tracks the next invoice number
- `.env` — Email credentials (not committed)

## Security Notes
- Never commit your `.env` file or credentials to version control.
- Passwords are hashed before storage.
- Only authenticated users can generate or email invoices.

## Customization
- To use a different email provider, update the Nodemailer transporter config in `server.js`.
- For production, consider using a database instead of JSON files.

## License
MIT 