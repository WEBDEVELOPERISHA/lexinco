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
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

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

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

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

const uploadDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const result = await pool.query('SELECT * FROM notices WHERE status = $1 AND send_at <= $2', ['pending_send', now]);
        for (const notice of result.rows) {
            try {
                await transporter.sendMail({
                    from: `"Lexinco" <info@lexinco.com>`,
                    to: notice.client_email,
                    subject: 'Your Generated Legal Notice',
                    text: `Dear ${notice.client_name},\n\nPlease find attached your generated legal notice.\n\nBest regards,\nLexinco Team`,
                    attachments: [
                        {
                            filename: 'legal_notice.pdf',
                            path: notice.pdf_path,
                            contentType: 'application/pdf'
                        }
                    ]
                });
                await pool.query('UPDATE notices SET status = $1 WHERE notice_id = $2', ['sent', notice.notice_id]);
                console.log(`Notice ${notice.notice_id} sent successfully to ${notice.client_email}`);
            } catch (error) {
                console.error(`Failed to send notice ${notice.notice_id}:`, error);
            }
        }
    } catch (error) {
        console.error('Cron job error:', error);
    }
});

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
You are a senior legal assistant with over 20 years of experience in civil and contractual disputes in India, tasked with drafting a **comprehensive, jurisdiction-specific legal notice** on behalf of a client. The notice must adhere to the legal standards and practices of India and follow the exact format provided below.

**Objective:**  
- Draft a formal legal notice that is **a minimum of 4 A4 pages long (approximately 1200–1500 words)**, exhaustive, and detailed.  
- Use a **${formData.dispute.tone} tone** and ensure it is suitable for court submission or dispute resolution authorities in India.  
- Base the notice **solely on the provided facts**—do not invent or alter any details (e.g., names, events).  
- Include **relevant laws, statutes, or legal principles** from India (e.g., Indian Contract Act, 1872; Consumer Protection Act, 2019) to strengthen the notice.  
- Follow the exact structure and style of the sample notice provided below, including header, numbered paragraphs, and closing signature block.

**Sample Notice Format to Follow Exactly:**

BY REGISTERED POST/EMAIL

Date: ${todayDate}

To,
[Recipient Name]
[Recipient Address]

Subject: Legal Notice Regarding [Dispute Relationship] – Immediate Action Required

Under the instructions and authority from my client [Client Name], residing at [Client Address], Mobile: [Client Contact], I hereby address you as follows:

1. [Introduction to client’s background and business/relationship context, 200–300 words]
2. [Detailed description of the issue, including transaction details if provided in issue description, 300–400 words]
3. [Factual matrix of events leading to the dispute, 200–300 words]
4. [Explanation of recipient’s obligations or assurances, 200–300 words]
5. [Details of recipient’s failure to comply, 200–300 words]
6. [Client’s efforts to resolve the issue, 200–300 words]
7. [Accusation of dishonest or malafide conduct, 200–300 words]
8. [Financial loss and mental harassment suffered, 200–300 words]
9. [Legal basis for the claim, citing specific laws, 300–400 words]
10. [Demand for resolution, without specifying compensation or timeframe, 200–300 words]
11. [Warning of legal proceedings if unresolved, 200–300 words]
12. [Statement holding recipient responsible for costs, 100–200 words]
13. This legal notice is issued to you without prejudice to all other legal rights and remedies available to my client under the law.

Kindly treat this as a final and urgent notice.

For [Client Name]
Through his Legal Counsel,

(Advocate Shalini Tripathi)

---

**Dispute Details:**  
- **Dispute Type:** ${formData.dispute.relationship}  
- **Country:** India  
- **Description of Issue:** ${formData.dispute.issueDescription} (includes transaction date, place, and contract details if applicable)  
- **Key Events Timeline:** ${formData.dispute.keyEvents}  
- **Damages Suffered:** ${formData.dispute.damages}  

**Client Details (Sender):**  
- **Name:** ${formData.client.name}  
- **Address:** ${formData.client.address}  
- **Contact:** ${formData.client.contact}  
- **Email:** ${formData.client.email}  

**Recipient Details (Respondent):**  
- **Name:** ${formData.recipient.name}  
- **Address:** ${formData.recipient.address}  
- **Contact:** ${formData.recipient.contact || 'Not provided'}  
- **Email:** ${formData.recipient.email || 'Not provided'}  

---

**Formatting & Content Requirements:**  
- Structure the notice with **13 numbered paragraphs**, each thoroughly detailed as per the sample.  
- Ensure each paragraph is verbose, legally precise, and covers the specified word count.  
- Use professional legal language, logical flow, and exhaustive elaboration.  
- Cite specific Indian laws relevant to the dispute type (e.g., Indian Contract Act, 1872 for contractual disputes).  
- Avoid including specific compensation amounts or timeframes in the demand (as per user requirements).  
- End with the exact signature block: "For [Client Name]\nThrough his Legal Counsel,\n(Advocate Shalini Tripathi)".

**Output Format:**  
BY REGISTERED POST/EMAIL  

Date: ${todayDate}  

To,  
${formData.recipient.name}  
${formData.recipient.address}  

Subject: Legal Notice Regarding ${formData.dispute.relationship} – Immediate Action Required  

Under the instructions and authority from my client ${formData.client.name}, residing at ${formData.client.address}, Mobile: ${formData.client.contact}, I hereby address you as follows:  

[13 numbered paragraphs, 1200–1500 words total, following the sample structure]  

Kindly treat this as a final and urgent notice.  

For ${formData.client.name}  
Through his Legal Counsel,  

(Advocate Shalini Tripathi)  
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
        res.status(500).json({ error: 'Failed to generate notice', details: error.message });
    }
});

app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
        await pool.query('DELETE FROM otps WHERE email = $1', [email]);
        await pool.query('INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)', [email, otp, expiresAt]);

        await transporter.sendMail({
            from: `"Lexinco" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your OTP for Lexinco',
            html: `<p>Your OTP is <strong>${otp}</strong></p>`
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ error: 'Failed to send OTP', details: error.message });
    }
});

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

        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
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
        res.status(500).json({ error: 'Signup failed', details: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
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
            user: { id: user.user_id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Login failed', details: error.message });
    }
});

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
                issueDescription: notice.dispute_issue_description,
                keyEvents: notice.dispute_key_events,
                damages: notice.dispute_damages,
                tone: notice.dispute_tone
            },
            signature: notice.signature,
            content: notice.content,
            status: notice.status,
            send_at: notice.send_at,
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
        res.status(500).json({ error: 'Failed to fetch notice', details: error.message });
    }
});

app.post('/api/update-payment', async (req, res) => {
    const { noticeId, paymentId, orderId, status } = req.body;

    try {
        const reviewEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
        res.status(500).json({ error: 'Failed to update payment', details: error.message });
    }
});

app.post('/api/send-invoice', async function (req, res) {
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
        console.error('Error sending invoice:', error);
        res.status(500).json({ error: 'Failed to send invoice', details: error.message });
    }
});

app.post('/api/send-notice', upload.single('pdf'), async (req, res) => {
    const { fromEmail, senderName } = req.body;
    const pdfFile = req.file;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
            <p>Dear ${senderName},</p>
            <p>Please find attached your generated legal notice.</p>
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
            Dear ${senderName},
            Please find attached your generated legal notice.
            For any inquiries, please reply to this email.
            Best regards,
            Lexinco Team
            ---
            Sent by Lexinco
            Email: support@lexinco.com
            Website: https://lexinco.com
        `;

        await transporter.sendMail({
            from: `"Lexinco Legal Notice" <info@lexinco.com>`,
            replyTo: `"${senderName}" <${fromEmail}>`,
            to: fromEmail,
            subject: 'Your Generated Legal Notice',
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
        res.status(500).json({ error: 'Failed to send notice', details: error.message });
    }
});

app.post('/api/create-order', async (req, res) => {
    try {
        const { noticeId } = req.body;
        if (!noticeId) {
            return res.status(400).json({ error: 'Notice ID is required' });
        }
        const amount = 150000;
        const shortNoticeId = noticeId.slice(0, 8);
        const shortTimestamp = Date.now().toString().slice(-6);
        const receipt = `order_${shortNoticeId}_t${shortTimestamp}`;
        if (receipt.length > 40) {
            console.warn('Receipt too long:', receipt);
            return res.status(400).json({ error: 'Generated receipt exceeds 40 characters' });
        }
        const options = {
            amount,
            currency: 'INR',
            receipt,
            payment_capture: 1
        };
        const order = await razorpay.orders.create(options);
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt
        });
    } catch (error) {
        console.error('Razorpay error:', error);
        res.status(500).json({
            error: error.error?.description || 'Failed to create payment order',
            details: error.message
        });
    }
});

app.post('/api/save-notice', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const noticeId = uuidv4();
        const pdfPath = path.join(uploadDir, `${noticeId}.pdf`);
        fs.renameSync(req.file.path, pdfPath);

        let client, recipient, dispute;
        try {
            client = JSON.parse(req.body.client);
            recipient = JSON.parse(req.body.recipient);
            dispute = JSON.parse(req.body.dispute);
        } catch (error) {
            console.error('JSON Parse Error:', error);
            return res.status(400).json({ error: 'Invalid JSON data', details: error.message });
        }

        const maxLengthFields = {
            client_name: client.name,
            client_address: client.address,
            client_contact: client.contact,
            client_email: client.email,
            recipient_name: recipient.name,
            recipient_address: recipient.address,
            recipient_contact: recipient.contact || '',
            recipient_email: recipient.email || '',
            dispute_relationship: dispute.relationship,
            dispute_issue_description: dispute.issueDescription,
            dispute_key_events: dispute.keyEvents,
            dispute_damages: dispute.damages,
            dispute_tone: dispute.tone
        };

        for (const [field, value] of Object.entries(maxLengthFields)) {
            if (typeof value === 'string' && value.length > 255) {
                return res.status(400).json({ error: `Field ${field} exceeds 255 characters`, details: `Value: ${value.substring(0, 50)}...` });
            }
        }

        const signature = req.body.signature || null;
        const content = req.body.content;
        const status = 'pending_send';
        const sendAt = new Date(Date.now() + 30 * 60 * 1000);

        const query = `
            INSERT INTO notices (
                notice_id, client_name, client_address, client_contact, client_email,
                recipient_name, recipient_address, recipient_contact, recipient_email,
                dispute_relationship, dispute_issue_description, dispute_key_events,
                dispute_damages, dispute_tone, signature, content, status, pdf_path, send_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING notice_id
        `;
        const values = [
            noticeId,
            client.name,
            client.address,
            client.contact,
            client.email,
            recipient.name,
            recipient.address,
            recipient.contact || '',
            recipient.email || '',
            dispute.relationship,
            dispute.issueDescription,
            dispute.keyEvents,
            dispute.damages,
            dispute.tone,
            signature,
            content,
            status,
            pdfPath,
            sendAt
        ];

        await pool.query(query, values);
        res.json({ success: true, noticeId });
    } catch (error) {
        console.error('Save Notice Error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        const errorDetails = error.message.includes('value too long') ? 
            `Database error: ${error.message}. Check column lengths in notices table.` : 
            error.message;
        res.status(500).json({ error: 'Failed to save notice', details: errorDetails });
    }
});

app.post('/api/send-notice/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM notices WHERE notice_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notice not found' });
        }
        const notice = result.rows[0];
        const now = new Date();
        if (now < notice.send_at) {
            return res.status(400).json({ error: 'Not yet time to send' });
        }

        await transporter.sendMail({
            from: `"Lexinco" <info@lexinco.com>`,
            to: notice.client_email,
            subject: 'Your Generated Legal Notice',
            text: `Dear ${notice.client_name},\n\nPlease find attached your generated legal notice.\n\nBest regards,\nLexinco Team`,
            attachments: [
                {
                    filename: 'legal_notice.pdf',
                    path: notice.pdf_path,
                    contentType: 'application/pdf'
                }
            ]
        });

        await pool.query('UPDATE notices SET status = $1 WHERE notice_id = $2', ['sent', id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Send Notice Error:', error);
        res.status(500).json({ error: 'Failed to send notice', details: error.message });
    }
});

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
        res.status(500).json({ error: 'Failed to upload PDF', details: error.message });
    }
});

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
        res.send(`Email failed: ${error.message}`);
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
        res.status(500).send(`DB access failed: ${error.message}`);
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
        res.status(500).json({ error: 'Failed to submit consultation request', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});