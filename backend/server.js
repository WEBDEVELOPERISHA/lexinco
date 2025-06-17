const express = require('express');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs'); // Added missing import
const Razorpay = require('razorpay');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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
    allowedHeaders: ['Content-Type', 'Authorization', 'user-id']
}));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));

// Postgres connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Razorpay setup
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID);
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are missing. Check your .env file.');
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Nodemailer setup
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

// Multer setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// Utility functions
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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
    const todayDate = new Date().toLocaleDateString('en-US', {
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
            max_tokens: 4096
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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
        await pool.query(
            'DELETE FROM otps WHERE email = $1',
            [email]
        );
        await pool.query(
            'INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)',
            [email, otp, expiresAt]
        );

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
        const otpResult = await pool.query(
            'SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > NOW()',
            [email, otp]
        );
        if (otpResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid/expired OTP. Please request a new one.' });
        }

        const userResult = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        if (userResult.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const insertResult = await pool.query(
            'INSERT INTO users (user_id, name, email, password_hash, is_verified) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email',
            [userId, name, email, passwordHash, true]
        );

        await pool.query('DELETE FROM otps WHERE email = $1', [email]);

        res.json({ success: true, user: insertResult.rows[0] });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({
            success: true,
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get Notice
app.get('/api/get-notice/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM notices WHERE notice_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({});
        }

        const notice = result.rows[0];
        res.json({
            id: notice.notice_id,
            userId: notice.user_id,
            client: {
                name: notice.client_name,
                address: notice.client_address,
                contact: notice.client_contact,
                email: notice.client_email
            },
            recipient: {
                name: notice.recipient_name,
                address: notice.recipient_address,
                contact: notice.recipient_contact,
                email: notice.recipient_email
            },
            dispute: {
                relationship: notice.dispute_relationship,
                transactionDate: notice.dispute_transaction_date,
                transactionPlace: notice.dispute_transaction_place,
                contractDetails: notice.dispute_contract_details,
                issueDescription: notice.dispute_issue_description,
                keyEvents: notice.dispute_key_events,
                damages: notice.dispute_damages,
                specificDemand: notice.dispute_specific_demand,
                compensation: notice.dispute_compensation,
                timeframe: notice.dispute_timeframe,
                tone: notice.dispute_tone
            },
            signature: notice.signature,
            content: notice.content,
            status: notice.status,
            payment: notice.payment_id ? {
                status: notice.status,
                paymentId: notice.payment_id,
                orderId: notice.order_id,
                updatedAt: notice.review_end_time
            } : null,
            createdAt: notice.created_at
        });
    } catch (error) {
        console.error('Get Notice Error:', error);
        res.status(500).json({ error: 'Failed to fetch notice' });
    }
});

// Update Payment
app.post('/api/update-payment', async (req, res) => {
    const { noticeId, paymentId, orderId, status } = req.body;

    try {
        const reviewEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const result = await pool.query(
            'UPDATE notices SET status = $1, payment_id = $2, order_id = $3, review_end_time = $4 WHERE notice_id = $5 RETURNING notice_id',
            [status, paymentId, orderId, reviewEndTime, noticeId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notice not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update Payment Error:', error);
        res.status(500).json({ error: 'Failed to update payment' });
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

// Send Notice
app.post('/api/send-notice', upload.single('pdf'), async (req, res) => {
    const { toEmail, fromEmail, senderName } = req.body;
    const pdfFile = req.file;

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

        await transporter.sendMail({
            from: `"Lexinco Legal Notice" <${process.env.EMAIL_USER}>`,
            replyTo: `"${senderName}" <${fromEmail}>`,
            to: toEmail,
            cc: fromEmail,
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

        fs.unlinkSync(pdfFile.path);
        res.json({ success: true });
    } catch (error) {
        console.error('Send Notice Error:', error);
        if (pdfFile && fs.existsSync(pdfFile.path)) {
            fs.unlinkSync(pdfFile.path);
        }
        res.status(500).json({ error: 'Failed to send notice' });
    }
});

// Create Razorpay Order
app.post('/api/create-order', async (req, res) => {
    try {
        const { noticeId } = req.body;
        const amount = 150000; // 1500 INR in paise
        const options = {
            amount,
            currency: 'INR',
            receipt: `order_${noticeId}_${Date.now()}`,
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
    const { client, recipient, dispute, signature, content, status } = req.body;
    const userId = req.headers['user-id'] || null; // Allow anonymous notices if no user-id

    try {
        const noticeId = uuidv4();
        const query = `
            INSERT INTO notices (
                notice_id, user_id, client_name, client_address, client_contact, client_email,
                recipient_name, recipient_address, recipient_contact, recipient_email,
                dispute_relationship, dispute_transaction_date, dispute_transaction_place,
                dispute_contract_details, dispute_issue_description, dispute_key_events,
                dispute_damages, dispute_specific_demand, dispute_compensation,
                dispute_timeframe, dispute_tone, signature, content, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
            RETURNING notice_id
        `;
        const values = [
            noticeId,
            userId,
            client.name,
            client.address,
            client.contact,
            client.email,
            recipient.name,
            recipient.address,
            recipient.contact,
            recipient.email,
            dispute.relationship,
            dispute.transactionDate,
            dispute.transactionPlace,
            dispute.contractDetails,
            dispute.issueDescription,
            dispute.keyEvents,
            dispute.damages,
            dispute.specificDemand,
            parseFloat(dispute.compensation) || 0,
            dispute.timeframe,
            dispute.tone,
            signature,
            content,
            status
        ];

        const result = await pool.query(query, values);
        console.log('Saved notice ID:', noticeId, 'User ID:', userId);
        res.json({ success: true, noticeId: result.rows[0].notice_id });
    } catch (error) {
        console.error('Save Notice Error:', error.message);
        res.status(500).json({ error: 'Failed to save notice', details: error.message });
    }
});

// Upload PDF for WhatsApp Sharing
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const uniqueId = uuidv4();
        const newFilename = `${uniqueId}-${file.originalname}`;
        const newPath = path.join(uploadDir, newFilename);
        fs.renameSync(file.path, newPath);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const result = await pool.query(
            'INSERT INTO files (file_path, expires_at) VALUES ($1, $2) RETURNING id',
            [newPath, expiresAt]
        );

        const fileUrl = `${process.env.HEROKU_APP_URL || `http://localhost:${PORT}`}/uploads/${newFilename}`;
        res.json({ success: true, url: fileUrl });
    } catch (error) {
        console.error('Upload PDF Error:', error);
        res.status(500).json({ error: 'Failed to upload PDF' });
    }
});

// Clean up expired files (every hour)
setInterval(async () => {
    try {
        const now = new Date();
        const result = await pool.query('SELECT id, file_path FROM files WHERE expires_at < $1', [now]);
        for (const file of result.rows) {
            try {
                fs.unlinkSync(file.file_path);
                await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        }
    } catch (error) {
        console.error('Cleanup Error:', error);
    }
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
        console.error('Test Email Error:', error);
        res.send('Email failed: ' + error.message);
    }
});

app.get('/test-db', async (req, res) => {
    try {
        const users = await pool.query('SELECT * FROM users');
        const notices = await pool.query('SELECT * FROM notices');
        const otps = await pool.query('SELECT * FROM otps');
        const files = await pool.query('SELECT * FROM files');
        res.json({
            users: users.rows,
            notices: notices.rows,
            otps: otps.rows,
            files: files.rows
        });
    } catch (error) {
        console.error('Test DB Error:', error);
        res.status(500).send('DB access failed');
    }
});

app.post('/api/proxy/consultation', async (req, res) => {
    try {
        const googleAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwdK6PlLge2f0ocZeve83K-ugdm23P5OozMSLhlnyV7_KdLJh1s-JEVmoVDRgxNgr_LbQ/exec';
        const response = await axios.post(googleAppsScriptUrl, req.body, {
            headers: { 'Content-Type': 'application/json' }
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