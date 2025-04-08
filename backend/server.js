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
require('dotenv').config();
const axios = require('axios');
const app = express();

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// Serve static files (relative to backend folder)
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

// Initialize Razorpay with environment variables only (no fallbacks in production)
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Email setup (GoDaddy SMTP)
const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Multer setup for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

// API Endpoints

// Redirect root URL to index.html or legal-notice.html
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.sendFile(path.join(__dirname, '..', 'public', 'legal-notice.html'));
    }
});

// New endpoint to provide Razorpay key ID to client
app.get('/api/config', (req, res) => {
    res.json({
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });
});
// Add this new endpoint before other API endpoints
app.post('/api/generate-notice', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const prompt = `You are a legal assistant. Draft a legal notice for a user in ${formData.dispute.country} who is facing the following issue:

- Dispute type: ${formData.dispute.relationship}
- Recipient: ${formData.recipient.name}
- Description: ${formData.dispute.issueDescription}
- Resolution demanded: ${formData.dispute.specificDemand}${formData.dispute.compensation ? ` amounting to ₹${formData.dispute.compensation}` : ''}
- Tone: ${formData.dispute.tone}

Make the notice sound like it's from a real person, based on the legal style commonly used in ${formData.dispute.country}. Mention relevant laws if available, but do not give legal advice. End with a clear call to action and timeline for response.

Additional Details:
- Client Name: ${formData.client.name}
- Client Address: ${formData.client.address}
- Client Contact: ${formData.client.contact}
- Client Email: ${formData.client.email}
- Recipient Address: ${formData.recipient.address}
- Recipient Contact: ${formData.recipient.contact}
- Recipient Email: ${formData.recipient.email}
- Transaction Date: ${formData.dispute.transactionDate}
- Transaction Place: ${formData.dispute.transactionPlace}
- Contract Details: ${formData.dispute.contractDetails}
- Key Events Timeline: ${formData.dispute.keyEvents}
- Damages Suffered: ${formData.dispute.damages}
- Laws Violated: ${formData.dispute.lawsViolated}
- Timeframe for Compliance: ${formData.dispute.timeframe}

Structure the notice like this:

To,  
[Recipient's Full Address]  
Subject: [Brief Subject with Legal Charges if any]  

Dated: ${todayDate}  

[Content of the Legal Notice]  

From,  
[Client's Full Name and Address]  

Signed: [This notice is digitally signed by the client]`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 2500
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
    const userId = req.headers['user-id']; // In real app, use proper auth

    try {
        const db = readDB();
        const newNotice = {
            id: Date.now(),
            userId,
            ...formData,
            createdAt: new Date().toISOString()
        };
        db.notices.push(newNotice);
        writeDB(db);
        res.json({ success: true, noticeId: newNotice.id });
    } catch (error) {
        console.error('Save Notice Error:', error);
        res.status(500).json({ error: 'Failed to save notice' });
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!fs.existsSync(DB_PATH)) {
        writeDB({ users: [], notices: [], otps: [], files: [] });
    }
});