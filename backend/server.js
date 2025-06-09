const express = require('express');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const Razorpay = require('razorpay');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const axios = require('axios');

const app = express();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://lexinco.herokuapp.com',
        'https://lexinco-dbd9de732777.herokuapp.com',
        'https://www.lexinco.com'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));

// JSON Database Setup
const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
        return { users: [], notices: [], otps: [], files: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Debug environment variables
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID);
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are missing. Check your .env file.');
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: { rejectUnauthorized: false }
});

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// API Endpoints
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.sendFile(path.join(__dirname, '..', 'public', 'legal-notice.html'));
    }
});

app.get('/api/config', (req, res) => {
    res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID });
});

app.post('/api/generate-notice', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', { // Changed to en-US for consistency
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const prompt = `
You are a senior legal assistant with over 20 years of experience in civil and contractual disputes, tasked with drafting a **comprehensive, jurisdiction-specific legal notice** on behalf of a client. The notice must adhere to the legal standards and practices of ${formData.dispute.country}.

**Objective:**  
- Draft a formal legal notice that is **a minimum of 4 A4 pages long (approximately 1200–1500 words)**, exhaustive, and detailed.  
- Use a **${formData.dispute.tone} tone** and ensure it is suitable for court submission or dispute resolution authorities in ${formData.dispute.country}.  
- Base the notice **solely on the provided facts**—do not invent or alter any details (e.g., names, dates, figures).  
- Include **relevant laws, statutes, or legal principles** from ${formData.dispute.country} to strengthen the notice.  

---

**Dispute Details:**  
- **Dispute Type:** ${formData.dispute.relationship}  
- **Country:** ${formData.dispute.country}  
- **Transaction Date:** ${formData.dispute.transactionDate}  
- **Transaction Place:** ${formData.dispute.transactionPlace}  
- **Contract Details:** ${formData.dispute.contractDetails}  
- **Key Events Timeline:** ${formData.dispute.keyEvents}  
- **Description of Dispute:** ${formData.dispute.issueDescription}  
- **Damages Suffered:** ${formData.dispute.damages}  
- **Specific Resolution Demanded:** ${formData.dispute.specificDemand}${formData.dispute.compensation ? ` amounting to $${formData.dispute.compensation} (USD)` : ''}  

---

**Client Details (Sender):**  
- **Name:** ${formData.client.name}  
- **Address:** ${formData.client.address}  
- **Contact:** ${formData.client.contact}  
- **Email:** ${formData.client.email}  

**Recipient Details (Respondent):**  
- **Name:** ${formData.recipient.name}  
- **Address:** ${formData.recipient.address}  
- **Contact:** ${formData.recipient.contact}  
- **Email:** ${formData.recipient.email}  

---

**Formatting & Content Requirements:**  
- Structure the notice with the following sections, each thoroughly detailed:  
  1. **Introduction and Identification of Parties** (200–300 words): Introduce the sender, respondent, and purpose of the notice.  
  2. **Detailed Background and Factual Matrix** (300–400 words): Provide an exhaustive factual background of the dispute.  
  3. **Timeline of Events** (200–300 words): List key events in chronological order with precise details.  
  4. **Legal Violations & Statutory References** (300–400 words): Cite specific laws from ${formData.dispute.country} and explain violations.  
  5. **Damages and Hardships Faced** (200–300 words): Detail financial, emotional, or other impacts on the sender.  
  6. **Legal Consequences of Non-Compliance** (200–300 words): Outline potential legal actions if the demand is unmet.  
  7. **Demand for Relief and Compliance Timeline** (200–300 words): Specify the resolution and deadline clearly.  
  8. **Conclusion and Final Intimation** (100–200 words): Summarize and issue a final call to action.  
- Ensure logical flow, professional legal language, and exhaustive elaboration in every section.  
- Use numbered paragraphs where applicable for clarity and formality.  

---

**Output Format:**  
To,  
[Recipient's Full Name]  
[Recipient’s Full Address]  

Subject: Legal Notice Regarding ${formData.dispute.relationship} – Immediate Action Required  

Dated: ${todayDate}  

[Full content of the legal notice here, meeting the 1200–1500 word requirement]  

From,  
${formData.client.name}  
${formData.client.address}  

Signed: This notice is digitally signed by the client  
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 4096 // Increased to handle longer output
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        const content = response.data.choices[0].message.content;
        res.json({ content });
    } catch (error) {
        console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response?.data?.error?.message || 'Failed to generate notice' });
    }
});
// Send OTP
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    try {
        const db = readDB();
        db.otps = db.otps.filter(o => o.email !== email);
        db.otps.push({ email, otp, expiresAt });
        writeDB(db);

        await transporter.sendMail({
            from: `"Lexinco" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your OTP for Lexinco',
            html: `<p>Your OTP is <strong>${otp}</strong></p>`
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Signup
app.post('/api/signup', async (req, res) => {
    const { name, email, password, otp } = req.body;

    try {
        const db = readDB();
        const otpRecord = db.otps.find(o =>
            o.email === email &&
            o.otp === otp &&
            new Date(o.expiresAt) > new Date()
        );

        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid/expired OTP. Please request a new one.' });
        }

        if (db.users.some(u => u.email === email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        db.users.push({
            id: Date.now(),
            name,
            email,
            password: await bcrypt.hash(password, 10),
            isVerified: true,
            createdAt: new Date().toISOString()
        });

        db.otps = db.otps.filter(o => o.email !== email);
        writeDB(db);

        res.json({ success: true });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const db = readDB();
        const user = db.users.find(u => u.email === email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get Notice
app.get('/api/get-notice/:id', (req, res) => {
    const db = readDB();
    const notice = db.notices.find(n => n.id == req.params.id);
    res.json(notice || {});
});

// Update Payment
app.post('/api/update-payment', (req, res) => {
    const { noticeId, paymentId, orderId, status } = req.body;
    const db = readDB();
    const notice = db.notices.find(n => n.id == noticeId);

    if (notice) {
        notice.payment = {
            status,
            paymentId,
            orderId,
            updatedAt: new Date().toISOString()
        };
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Notice not found' });
    }
});

// Send Invoice Email
app.post('/api/send-invoice', async (req, res) => {
    try {
        await transporter.sendMail({
            from: `"Lexinco" <${process.env.EMAIL_USER}>`,
            to: req.body.email,
            subject: 'Payment Receipt - Lexinco',
            text: req.body.content,
            html: req.body.htmlContent
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Invoice email error:', error);
        res.status(500).json({ error: 'Failed to send invoice' });
    }
});
app.post('/api/send-notice', upload.single('pdf'), async (req, res) => {
    const { toEmail, fromEmail, senderName } = req.body;
    const pdfFile = req.file;

    // Validate inputs
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!toEmail || !emailRegex.test(toEmail)) {
        return res.status(400).json({ error: 'Invalid recipient email address' });
    }
    if (!fromEmail || !emailRegex.test(fromEmail)) {
        return res.status(400).json({ error: 'Invalid sender email address' });
    }
    if (!senderName) {
        return res.status(400).json({ error: 'Sender name is required' });
    }
    if (!pdfFile) {
        return res.status(400).json({ error: 'PDF file is required' });
    }

    try {
        // Email body (HTML and plain text)
        const emailHtml = `
            <p>Dear Recipient,</p>
            <p>Please find attached the legal notice from ${senderName}.</p>
            <p>For any inquiries, please reply to this email.</p>
            <p>Best regards,<br>Lexinco Team</p>
            <hr>
            <p style="font-size: 10pt; color: #666;">
                Sent by Lexinco<br>
                Email: support@lexinco.com<br>
                Website: https://lexinco.com
            </p>
        `;
        const emailText = `
            Dear Recipient,
            Please find attached the legal notice from ${senderName}.
            For any inquiries, please reply to this email.
            Best regards,
            Lexinco Team
            ---
            Sent by Lexinco
            Email: support@lexinco.com
            Website: https://lexinco.com
        `;

        // Send email with PDF attachment and CC to sender
        await transporter.sendMail({
            from: `"Lexinco Legal Notice" <${process.env.EMAIL_USER}>`,
            replyTo: `"${senderName}" <${fromEmail}>`,
            to: toEmail,
            cc: fromEmail,  // CC the sender's email
            subject: 'Legal Notice',
            html: emailHtml,
            text: emailText,
            attachments: [
                {
                    filename: 'legal_notice.pdf',
                    path: pdfFile.path,
                    contentType: 'application/pdf'
                }
            ]
        });

        // Clean up temporary file
        fs.unlinkSync(pdfFile.path);

        res.json({ success: true });
    } catch (error) {
        console.error('Send Notice Error:', error);
        // Clean up file if it exists
        if (pdfFile && fs.existsSync(pdfFile.path)) {
            fs.unlinkSync(pdfFile.path);
        }
        res.status(500).json({ error: 'Failed to send notice' });
    }
});

// Create Razorpay Order
app.post('/api/create-order', async (req, res) => {
    try {
        const amount = 50000; // ₹500 in paise
        const options = {
            amount: amount,
            currency: 'INR',
            receipt: `order_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (error) {
        console.error('Razorpay error:', error);
        res.status(500).json({
            error: error.error?.description || 'Failed to create payment order',
            details: error
        });
    }
});

// Save Legal Notice
app.post('/api/save-notice', async (req, res) => {
    const formData = req.body;
    const userId = req.headers['user-id'] || 'anonymous'; // Fallback for missing user-id

    try {
        const db = readDB();
        db.notices = db.notices || []; // Ensure notices array exists
        const newNotice = {
            id: Date.now(),
            userId,
            ...formData,
            createdAt: new Date().toISOString()
        };
        console.log('Saving notice ID:', newNotice.id, 'User ID:', userId);
        db.notices.push(newNotice);
        console.log('Notices before save:', db.notices.length - 1);
        writeDB(db);
        console.log('Notices after save:', db.notices.length);
        res.json({ success: true, noticeId: newNotice.id });
    } catch (error) {
        console.error('Save Notice Error:', error.message);
        res.status(500).json({ error: 'Failed to save notice', details: error.message });
    }
});

// Upload PDF for WhatsApp Sharing
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.post('/api/upload-pdf', upload.single('pdf'), (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const uniqueId = uuidv4();
        const newFilename = `${uniqueId}-${file.originalname}`;
        const newPath = path.join(uploadDir, newFilename);

        fs.renameSync(file.path, newPath);

        const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        const db = readDB();
        db.files = db.files || [];
        db.files.push({ path: newPath, expiresAt });
        writeDB(db);

        const fileUrl = `http://localhost:${PORT}/uploads/${newFilename}`;
        res.json({ success: true, url: fileUrl });
    } catch (error) {
        console.error('Upload PDF Error:', error);
        res.status(500).json({ error: 'Failed to upload PDF' });
    }
});

// Clean up expired files (every hour)
setInterval(() => {
    const db = readDB();
    const now = Date.now();
    db.files = db.files || [];
    db.files = db.files.filter(file => {
        if (file.expiresAt < now) {
            try {
                fs.unlinkSync(file.path);
                return false;
            } catch (error) {
                console.error('Error deleting file:', error);
                return true;
            }
        }
        return true;
    });
    writeDB(db);
}, 60 * 60 * 1000);

// Test Endpoints
app.get('/test-email', async (req, res) => {
    try {
        await transporter.sendMail({
            to: 'test@example.com',
            subject: 'Test Email',
            text: 'This is a test email'
        });
        res.send('Email sent!');
    } catch (error) {
        console.error(error);
        res.send('Email failed: ' + error.message);
    }
});

app.get('/test-db', (req, res) => {
    try {
        const db = readDB();
        res.json(db);
    } catch (error) {
        console.error(error);
        res.status(500).send('DB access failed');
    }
});
app.post('/api/proxy/consultation', async (req, res) => {
    try {
        const googleAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwdK6PlLge2f0ocZeve83K-ugdm23P5OozMSLhlnyV7_KdLJh1s-JEVmoVDRgxNgr_LbQ/exec';
        const response = await axios.post(googleAppsScriptUrl, req.body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Proxy Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to submit consultation request' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});