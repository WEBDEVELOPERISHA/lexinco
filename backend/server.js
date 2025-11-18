const express = require('express');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const OpenAI = require("openai");
const axios = require('axios');
const PDFDocument = require('pdfkit');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
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

function numberToWords(number) {
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const thousands = ['', 'Thousand', 'Lakh', 'Crore'];

    if (number === 0) return 'Zero';
    if (number < 0) return 'Minus ' + numberToWords(Math.abs(number));

    let words = '';
    let crore = Math.floor(number / 10000000);
    number %= 10000000;
    let lakh = Math.floor(number / 100000);
    number %= 100000;
    let thousand = Math.floor(number / 1000);
    number %= 1000;
    let hundred = Math.floor(number / 100);
    number %= 100;
    let ten = Math.floor(number / 10);
    let unit = number % 10;

    if (crore) words += numberToWords(crore) + ' Crore ';
    if (lakh) words += numberToWords(lakh) + ' Lakh ';
    if (thousand) words += numberToWords(thousand) + ' Thousand ';
    if (hundred) words += units[hundred] + ' Hundred ';
    if (ten || unit) {
        if (ten < 1) words += units[unit];
        else if (ten === 1) words += teens[unit];
        else words += tens[ten] + (unit ? ' ' + units[unit] : '');
    }
    return words.trim() + ' Only';
}
// === GET ALL BLOGS ===
app.get('/api/blogs', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT blog_id, title, description, image_url, created_at
      FROM blogs
      ORDER BY created_at DESC
    `);
        res.json({ success: true, blogs: result.rows });
    } catch (error) {
        console.error('Get Blogs Error:', error);
        res.status(500).json({ error: 'Failed to fetch blogs' });
    }
});
/* -------------------------------------------------
   LIKES
   ------------------------------------------------- */
app.post('/api/story/:id/like', async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    try {
        // Toggle like
        const exists = await pool.query(
            'SELECT 1 FROM story_likes WHERE story_id = $1 AND user_id = $2',
            [id, user_id]
        );

        if (exists.rows.length > 0) {
            await pool.query('DELETE FROM story_likes WHERE story_id = $1 AND user_id = $2', [id, user_id]);
            await pool.query('UPDATE stories SET likes_count = likes_count - 1 WHERE story_id = $1', [id]);
            res.json({ success: true, liked: false });
        } else {
            await pool.query(
                'INSERT INTO story_likes (story_id, user_id) VALUES ($1, $2)',
                [id, user_id]
            );
            await pool.query('UPDATE stories SET likes_count = likes_count + 1 WHERE story_id = $1', [id]);
            res.json({ success: true, liked: true });
        }
    } catch (err) {
        console.error('Like error:', err);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

/* -------------------------------------------------
   COMMENTS
   ------------------------------------------------- */
app.get('/api/story/:id/comments', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
    SELECT c.*, u.name AS user_name
    FROM story_comments c
    LEFT JOIN users u ON c.user_id = u.user_id::uuid
    WHERE c.story_id = $1::uuid
    ORDER BY c.created_at ASC
`, [id]);

        res.json({ success: true, comments: result.rows });
    } catch (err) {
        console.error('Get comments error:', err);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});


app.post('/api/story/:id/comment', async (req, res) => {
    const { id } = req.params;
    const { user_id, content, parent_id } = req.body;

    if (!user_id || !content) {
        return res.status(400).json({ error: 'user_id and content required' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO story_comments (story_id, user_id, parent_id, content)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
            RETURNING comment_id, created_at, user_id, content, parent_id
        `, [id, user_id, parent_id || null, content]);

        await pool.query(
            'UPDATE stories SET comments_count = comments_count + 1 WHERE story_id = $1::uuid',
            [id]
        );

        res.json({ success: true, comment: result.rows[0] });
    } catch (err) {
        console.error('Post comment error:', err);
        res.status(500).json({ error: 'Failed to post comment' });
    }
});


/* -------------------------------------------------
   FILTERED STORIES
   ------------------------------------------------- */
app.get('/api/stories/filter', async (req, res) => {
    const { filter = 'all', limit = 20, offset = 0 } = req.query;
    let query = '';
    let values = [limit, offset];

    if (filter === 'trending') {
        query = `
            SELECT * FROM stories 
            ORDER BY likes_count DESC, created_at DESC 
            LIMIT $1 OFFSET $2
        `;
    } else if (filter === 'recent') {
        query = `
            SELECT * FROM stories 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `;
    } else {
        query = `
            SELECT * FROM stories 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `;
    }

    try {
        const result = await pool.query(query, values);
        res.json({ success: true, stories: result.rows });
    } catch (err) {
        console.error('Filter error:', err);
        res.status(500).json({ error: 'Failed to fetch filtered stories' });
    }
});

/* -------------------------------------------------
   USER PROFILE STORIES
   ------------------------------------------------- */
app.get('/api/user/:id/stories', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at DESC',
            [id]
        );
        res.json({ success: true, stories: result.rows });
    } catch (err) {
        console.error('User stories error:', err);
        res.status(500).json({ error: 'Failed to fetch user stories' });
    }
});

// === UPLOAD BLOG ===
app.post('/api/upload-blog', upload.single('image'), async (req, res) => {
    const { title, description } = req.body;
    const imageFile = req.file;

    if (!title || !description || !imageFile) {
        return res.status(400).json({ error: 'Missing title, description, or image' });
    }

    try {
        const blogId = uuidv4();
        const imageExt = path.extname(imageFile.originalname);
        const imageName = `${blogId}${imageExt}`;
        const imagePath = path.join(uploadDir, imageName);
        fs.renameSync(imageFile.path, imagePath);

        const imageUrl = `${process.env.HEROKU_APP_URL || `http://localhost:${PORT}`}/Uploads/${imageName}`;

        const query = `
      INSERT INTO blogs (blog_id, title, description, image_url, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
        const result = await pool.query(query, [blogId, title, description, imageUrl]);

        res.json({ success: true, blog: result.rows[0] });
    } catch (error) {
        console.error('Upload Blog Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to upload blog' });
    }
});

// API Routes
app.get('/api/config', (req, res) => {
    res.json({});
});
app.get('/api/stories', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                story_id, user_id, original_lang, original_text,
                ai_summary, amount, evidence_count, tags,
                type, status, created_at
            FROM stories
            ORDER BY created_at DESC
        `);
        res.json({ success: true, stories: result.rows });
    } catch (err) {
        console.error('GET /api/stories error:', err);
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

// POST a new story + AI summary
app.post('/api/story', async (req, res) => {
    const {
        user_id,
        original_lang,
        original_text,
        amount,
        evidence_count = 0,
        tags = [],
        type
    } = req.body;

    if (!user_id || !original_lang || !original_text) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // ---------- AI SUMMARY ----------
        const summaryPrompt = `
You are a concise legal-assistant AI. Summarise the following user story in **one short English sentence** (max 30 words). 
Keep the tone neutral and factual. Return ONLY the summary.

Language: ${original_lang}
Story: """${original_text}"""
`;

        const aiRes = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: summaryPrompt }],
            temperature: 0.2,
            max_tokens: 60
        });
        const ai_summary = (aiRes.choices[0].message.content || original_text).trim();

        // ---------- SAVE TO DB ----------
        const q = `
            INSERT INTO stories (
                user_id, original_lang, original_text, ai_summary,
                amount, evidence_count, tags, type
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING story_id
        `;
        const vals = [
            user_id, original_lang, original_text, ai_summary,
            amount, evidence_count, tags, type
        ];
        const { rows } = await pool.query(q, vals);
        const story_id = rows[0].story_id;

        res.json({ success: true, story_id, ai_summary });
    } catch (err) {
        console.error('POST /api/story error:', err);
        res.status(500).json({ error: 'Failed to save story' });
    }
});

app.post('/api/generate-sale-agreement', upload.none(), async (req, res) => {
    const { seller, buyer, product, delivery, paymentMode, executionPlace, jurisdiction } = req.body;

    try {
        // Validate required fields
        if (!seller.name || !seller.address || !seller.contact || !seller.email ||
            !buyer.name || !buyer.address || !buyer.contact || !buyer.email ||
            !product.description || !product.quantity || !product.price || !product.totalPrice ||
            !delivery.address || !delivery.date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Build prompt for OpenAI
        // Build prompt for OpenAI
        const prompt = `
You are an expert Indian legal draftsman. Draft a comprehensive, professional, multi-page 
"Sale Agreement" under Indian law. The agreement should be highly detailed, word-heavy, 
formal, and formatted to appear 5–6 pages long when converted into PDF. 

The draft must include (with expanded language and formal tone):
- Recitals
- Definitions
- Sale Consideration
- Payment Terms (including advance, balance, bank transfer, default consequences)
- Delivery & Possession (including vacant possession, handover of keys, documents, and condition of property)
- Representations and Warranties (seller’s ownership, no encumbrances, buyer’s due diligence)
- Indemnity
- Stamp Duty, Registration & Other Charges (explicitly state that buyer bears unless otherwise agreed)
- Force Majeure
- Default and Termination (advance forfeiture, refund obligations, legal remedies)
- Governing Law and Jurisdiction
- Dispute Resolution (mandatory arbitration clause under Arbitration & Conciliation Act, 1996)
- Miscellaneous (entire agreement, amendment, severability, notices, counterparts)
- Execution and Witness section
- Annexure/Schedule: Full property description (boundaries, measurements, flat/unit details, parking, etc.)

Fill in the following details accurately:

Seller:
- Name: ${seller.name}
- Father's Name: ${seller.fatherName || 'Not provided'}
- Address: ${seller.address}
- Contact: ${seller.contact}
- Email: ${seller.email}

Buyer:
- Name: ${buyer.name}
- Father's Name: ${buyer.fatherName || 'Not provided'}
- Address: ${buyer.address}
- Contact: ${buyer.contact}
- Email: ${buyer.email}

Product/Property:
- Description: ${product.description}
- Quantity/Area: ${product.quantity}
- Price per Unit: ₹${product.price}
- Total Price (Sale Consideration): ₹${product.totalPrice}

Delivery:
- Address: ${delivery.address}
- Date (Handover of possession): ${delivery.date}

Other:
- Payment Mode: ${paymentMode || 'Not specified'}
- Place of Execution: ${executionPlace || 'Mumbai'}
- Jurisdiction: ${jurisdiction || 'Mumbai'}

Draft in a very formal, verbose, and professional manner as if prepared by a senior advocate. 
Make the clauses long and explanatory. Add transitional legal phrases such as 
"AND WHEREAS," "NOW THEREFORE," "IT IS HEREBY AGREED," etc. 

Do not explain or annotate. Return only the fully formatted agreement text.
`;

        // Call OpenAI
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // switch to gpt-4.1 for more depth
            messages: [
                { role: "system", content: "You are a professional Indian legal document drafter." },
                { role: "user", content: prompt }
            ],
            temperature: 0.4,
        });

        const content = response.choices[0].message.content;

        // Generate PDF
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const pdfPath = path.join(uploadDir, `drafted_sale-agreement_${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        doc.fontSize(12).text(content, {
            align: "justify",
            lineGap: 6
        });
        doc.end();

        writeStream.on('finish', async () => {
            // Send email
            const emailHtml = `
                <p>Dear Lexinco Team,</p>
                <p>A new Sale Agreement has been generated by ${seller.name}.</p>
                <p>User Details:<br>Name: ${seller.name}<br>Email: ${seller.email}</p>
                <p>Please review the attached document and contact the user for further steps.</p>
                <p>Best regards,<br>Lexinco System</p>
            `;

            const emailText = `
Dear Lexinco Team,
A new Sale Agreement has been generated by ${seller.name}.
User Details:
Name: ${seller.name}
Email: ${seller.email}
Please review the attached document and contact the user for further steps.
Best regards,
Lexinco System
            `;

            await transporter.sendMail({
                from: `"Lexinco Drafting Tool" <${process.env.EMAIL_USER}>`,
                to: 'info@lexinco.com',
                subject: 'New Sale Agreement Generated',
                html: emailHtml,
                text: emailText,
                attachments: [
                    {
                        filename: 'drafted_sale-agreement.pdf',
                        path: pdfPath,
                        contentType: 'application/pdf'
                    }
                ]
            });

            fs.unlinkSync(pdfPath);
            res.json({ success: true, content });
        });

    } catch (error) {
        console.error('Generate Sale Agreement Error:', error);
        res.status(500).json({ error: 'Failed to generate sale agreement', details: error.message });
    }
});


// Other API Routes (unchanged from your original server.js)
app.post('/api/generate-notice', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    if (!formData.client || !formData.recipient || !formData.dispute) {
        console.error('Invalid form data:', formData);
        return res.status(400).json({ error: 'Invalid form data', details: 'Missing client, recipient, or dispute data' });
    }

    // Sanitize sensitive data
    const sanitizedFormData = {
        client: {
            name: '[CLIENT_NAME]',
            address: '[CLIENT_ADDRESS]',
            contact: '[CLIENT_CONTACT]',
            email: '[CLIENT_EMAIL]'
        },
        recipient: {
            name: '[RECIPIENT_NAME]',
            address: '[RECIPIENT_ADDRESS]',
            contact: formData.recipient.contact ? '[RECIPIENT_CONTACT]' : '',
            email: formData.recipient.email ? '[RECIPIENT_EMAIL]' : ''
        },
        dispute: {
            issueDescription: formData.dispute.issueDescription,
            damages: formData.dispute.damages
        }
    };

    const template = `
BY REGISTERED /POST/EMAIL

                                                             Date: ${todayDate}

To,  
${sanitizedFormData.recipient.name}  
${sanitizedFormData.recipient.address}

Subject: Legal Notice regarding Dispute

Under the instructions and authority from my client ${sanitizedFormData.client.name}, residing at ${sanitizedFormData.client.address}, Mobile: ${sanitizedFormData.client.contact}, I hereby address you as follows:

That my client and you entered into a transaction/understanding, as described: ${sanitizedFormData.dispute.issueDescription}.  

That my client fulfilled all obligations as agreed under the understanding/transaction.  

That you were obligated to act as per the understanding but failed to do so.  

That despite repeated follow-ups, no satisfactory resolution was offered.  

That such failure indicates breach of trust.  

That my client has suffered losses and inconvenience, as described: ${sanitizedFormData.dispute.damages}.  

That your conduct constitutes a legal wrong under applicable Indian laws, including but not limited to the Indian Contract Act, 1872.  

That my client hereby demands that the dispute be resolved immediately by [specify action, e.g., payment of dues, performance of obligations].  

That if you fail to act within 7 days from the receipt of this notice, legal proceedings (civil and/or criminal) will be initiated at your risk.  

That you shall be liable for all litigation costs, damages, and consequences arising from your failure to comply.  

That this legal notice serves as a final opportunity for resolution.  

This legal notice is issued to you without prejudice to all other legal rights and remedies available to my client under the law.

Kindly treat this as a final and urgent notice.

For ${sanitizedFormData.client.name}  
Through his Legal Counsel,  

(Advocate Shalini Tripathi)
`;

    const prompt = `
You are a senior legal assistant with 20+ years of experience in Indian civil and contractual legal matters.

Your task is to draft a **formal legal notice** based on the provided form data. The notice must:
- Be comprehensive (approx. 1200–1500 words, around 4 A4 pages).
- Use **Indian legal language** with a formal tone.
- Be suitable for court/legal submission.
- Reference relevant laws (e.g., Indian Contract Act, 1872) where applicable.
- **EXACTLY** follow the structure provided below, without adding, removing, or modifying any sections, headers, or formatting. Every paragraph after the introductory statement must start with "That". Do not include any additional text, explanations, or markdown symbols outside the template. Do not include letterhead or signatures, as these are added separately.

**Form Data**:
- Client Name: ${sanitizedFormData.client.name}
- Client Address: ${sanitizedFormData.client.address}
- Client Contact: ${sanitizedFormData.client.contact}
- Client Email: ${sanitizedFormData.client.email}
- Recipient Name: ${sanitizedFormData.recipient.name}
- Recipient Address: ${sanitizedFormData.recipient.address}
- Recipient Contact: ${sanitizedFormData.recipient.contact}
- Recipient Email: ${sanitizedFormData.recipient.email}
- Issue Description: ${sanitizedFormData.dispute.issueDescription}
- Damages Suffered: ${sanitizedFormData.dispute.damages}

**Template to Follow**:
${template}

**Instructions**:
1. Fill in the placeholders in the template with detailed content based on the form data.
2. For the paragraph starting with "That my client and you entered into a transaction/understanding, as described:", elaborate based on the issue description.
3. For the paragraph starting with "That my client has suffered losses and inconvenience, as described:", elaborate based on the damages suffered.
4. For the paragraph starting with "That my client hereby demands...", specify a clear action (e.g., payment of Rs. X, return of property) based on the issue description and damages.
5. Ensure each "That" paragraph is detailed, legally precise, and contextually relevant to the dispute.
6. Output **only** the filled-in template, with no additional text or formatting.
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_tokens: 4096
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        let content = response.data.choices[0].message.content;

        // Validate response structure
        const expectedStart = `BY REGISTERED /POST/EMAIL`;
        const expectedEnd = `(Advocate Shalini Tripathi)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template;
        }

        // Reattach original details
        content = content
            .replace(/\[CLIENT_NAME\]/g, formData.client.name)
            .replace(/\[CLIENT_ADDRESS\]/g, formData.client.address)
            .replace(/\[CLIENT_CONTACT\]/g, formData.client.contact)
            .replace(/\[CLIENT_EMAIL\]/g, formData.client.email || '')
            .replace(/\[RECIPIENT_NAME\]/g, formData.recipient.name)
            .replace(/\[RECIPIENT_ADDRESS\]/g, formData.recipient.address)
            .replace(/\[RECIPIENT_CONTACT\]/g, formData.recipient.contact || '')
            .replace(/\[RECIPIENT_EMAIL\]/g, formData.recipient.email || '');

        // Format content for frontend
        content = content
            .replace(/\n\n/g, '<p>')
            .replace(/\n/g, '<br>')
            .replace(/\t/g, '    ');

        res.json({ content });
    } catch (error) {
        console.error('OpenAI API Error:', {
            message: error.message,
            response: error.response ? error.response.data : null,
            status: error.response ? error.response.status : null
        });
        res.status(500).json({
            error: 'Failed to generate notice',
            details: error.response?.data?.error?.message || error.message
        });
    }
});
// app.post('/api/generate-advocate-notice', async (req, res) => {
//     const formData = req.body;
//     const todayDate = new Date().toLocaleDateString('en-US', {
//         day: 'numeric',
//         month: 'long',
//         year: 'numeric'
//     });

//     // Validate form data
//     if (!formData.client || !formData.recipient || !formData.dispute) {
//         console.error('Invalid form data:', formData);
//         return res.status(400).json({ error: 'Invalid form data', details: 'Missing client, recipient, or dispute data' });
//     }

//     // Legal notice template
//     const template = `
// BY REGISTERED /POST/EMAIL

//                                                              Date: ${todayDate}

// To,  
// ${formData.recipient.name}  
// ${formData.recipient.address}

// Subject: Legal Notice regarding ${formData.dispute.relationship.charAt(0).toUpperCase() + formData.dispute.relationship.slice(1).replace(/-/g, ' ')}

// Under the instructions and authority from my client ${formData.client.name}, residing at ${formData.client.address}, Mobile: ${formData.client.contact}, Email: ${formData.client.email}, I, Advocate Shalini L Tripathi, hereby address you as follows:

// That my client and you entered into a transaction/understanding, as described: ${formData.dispute.issueDescription}.  

// That my client fulfilled all obligations as agreed under the understanding/transaction.  

// That you were obligated to act as per the understanding but failed to do so.  

// That despite repeated follow-ups, no satisfactory resolution was offered.  

// That such failure indicates breach of trust and/or contractual obligations.  

// That my client has suffered losses and inconvenience, as described: ${formData.dispute.damages}.  

// That your conduct constitutes a legal wrong under applicable Indian laws, including but not limited to the Indian Contract Act, 1872, and other relevant statutes.  

// That my client hereby demands that the dispute be resolved immediately by ${formData.dispute.damages}.  

// That if you fail to comply within 7 days from the receipt of this notice, legal proceedings (civil and/or criminal) will be initiated at your risk and cost.  

// That you shall be liable for all litigation costs, damages, and consequences arising from your failure to comply.  

// That this legal notice serves as a final opportunity for resolution.  

// This legal notice is issued to you without prejudice to all other legal rights and remedies available to my client under the law.

// Kindly treat this as a final and urgent notice.

// For ${formData.client.name}  
// Through his Legal Counsel,  

// (Advocate Shalini L Tripathi)
// `;

//     // Prompt for OpenAI
//     const prompt = `
// You are a senior legal assistant with 20+ years of experience in Indian civil and contractual legal matters, assisting Advocate Shalini L Tripathi.

// Your task is to draft a **formal legal notice** for an advocate based on the provided form data. The notice must:
// - Be comprehensive (approx. 1200–1500 words, around 4 A4 pages).
// - Use **Indian legal language** with a ${formData.dispute.tone} tone (formal, assertive, or conciliatory).
// - Be suitable for court/legal submission in India.
// - Reference relevant laws (e.g., Indian Contract Act, 1872, or other statutes like the Specific Relief Act, 1963, where applicable).
// - **EXACTLY** follow the structure provided below, without adding, removing, or modifying any sections, headers, or formatting. Every paragraph after the introductory statement must start with "That". Do not include any additional text, explanations, or markdown symbols outside the template. Do not include letterhead or signatures, as these are added separately by the frontend.

// **Form Data**:
// - Client Name: ${formData.client.name}
// - Client Address: ${formData.client.address}
// - Client Contact: ${formData.client.contact}
// - Client Email: ${formData.client.email}
// - Recipient Name: ${formData.recipient.name}
// - Recipient Address: ${formData.recipient.address}
// - Recipient Contact: ${formData.recipient.contact}
// - Recipient Email: ${formData.recipient.email}
// - Notice Type: ${formData.dispute.relationship}
// - Issue Description: ${formData.dispute.issueDescription}
// - Key Events: ${formData.dispute.keyEvents}
// - Damages Sought: ${formData.dispute.damages}
// - Tone: ${formData.dispute.tone}

// **Template to Follow**:
// ${template}

// **Instructions**:
// 1. Fill in the placeholders in the template with detailed content based on the form data.
// 2. For the paragraph starting with "That my client and you entered into a transaction/understanding, as described:", provide a detailed elaboration based on the issue description and key events, including specific dates, agreements, or actions where relevant.
// 3. For the paragraph starting with "That my client has suffered losses and inconvenience, as described:", elaborate on the damages suffered, quantifying losses (e.g., monetary, emotional, or reputational) where possible.
// 4. For the paragraph starting with "That my client hereby demands...", specify a clear and precise action (e.g., payment of Rs. X, performance of specific obligations, cessation of actions) based on the damages sought.
// 5. For the paragraph referencing applicable laws, include specific sections of the Indian Contract Act, 1872 (e.g., Section 73 for breach of contract damages) or other relevant laws based on the notice type (e.g., Defamation under Section 499 IPC for defamation notices).
// 6. Ensure each "That" paragraph is detailed, legally precise, and contextually relevant to the dispute, maintaining the specified tone.
// 7. Output **only** the filled-in template, with no additional text or formatting.
// `;

//     try {
//         const response = await axios.post('https://api.openai.com/v1/chat/completions', {
//             model: "gpt-4o",
//             messages: [{ role: "user", content: prompt }],
//             temperature: 0.1,
//             max_tokens: 4096
//         }, {
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
//             }
//         });

//         let content = response.data.choices[0].message.content;

//         // Validate response structure
//         const expectedStart = `BY REGISTERED /POST/EMAIL`;
//         const expectedEnd = `(Advocate Shalini L Tripathi)`;
//         if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
//             console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
//             content = template; // Fallback to template if structure is incorrect
//         }

//         // Format content for frontend
//         content = content
//             .replace(/\n\n/g, '<p>')
//             .replace(/\n/g, '<br>')
//             .replace(/\t/g, '    ');

//         res.json({ content });
//     } catch (error) {
//         console.error('OpenAI API Error:', {
//             message: error.message,
//             response: error.response ? error.response.data : null,
//             status: error.response ? error.response.status : null
//         });
//         res.status(500).json({
//             error: 'Failed to generate advocate notice',
//             details: error.response?.data?.error?.message || error.message
//         });
//     }
// });

app.post('/api/generate-power-of-attorney', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    try {
        if (!formData.principal || !formData.attorney || !formData.powerType || !formData.purpose || !formData.duration) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Build prompt for OpenAI
        const prompt = `
You are an expert Indian legal draftsman. Draft a detailed, professional, multi-page "Power of Attorney" document
under Indian law. It should be written in formal legal language and include expanded standard clauses:

- Recitals / Background
- Appointment of Attorney
- Powers granted (detailed list, specific to ${formData.purpose})
- Clarify whether it is General Power of Attorney (GPA) or Special Power of Attorney (SPA)
- Duration and revocation procedure (revocable with written notice)
- Representations and warranties
- Indemnity
- Notices and communication
- Governing law and jurisdiction
- Miscellaneous (entire agreement, amendment, severability, counterparts, execution and witness section)

Use the following details accurately:

Principal:
- Name: ${formData.principal.name}
- Address: ${formData.principal.address}
- Contact: ${formData.principal.contact || 'N/A'}
- Email: ${formData.principal.email || 'N/A'}

Attorney:
- Name: ${formData.attorney.name}
- Address: ${formData.attorney.address}
- Contact: ${formData.attorney.contact || 'N/A'}
- Email: ${formData.attorney.email || 'N/A'}

Power Type: ${formData.powerType}
Purpose: ${formData.purpose}
Duration: ${formData.duration}
Execution Date: ${todayDate}

Return only the fully formatted legal document text suitable for PDF generation.
`;

        // Generate content using OpenAI
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a professional Indian legal document drafter." },
                { role: "user", content: prompt }
            ],
            temperature: 0.4,
        });

        const content = response.choices[0].message.content;

        // Generate PDF
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const pdfPath = path.join(uploadDir, `drafted_power-of-attorney_${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        doc.fontSize(12).text(content, { align: "justify", lineGap: 6 });
        doc.end();

        writeStream.on('finish', async () => {
            const emailHtml = `
                <p>Dear Lexinco Team,</p>
                <p>A new Power of Attorney has been generated by ${formData.principal.name}.</p>
                <p>Please review the attached document and contact the user for further steps.</p>
                <p>Best regards,<br>Lexinco System</p>
            `;
            const emailText = `
A new Power of Attorney has been generated by ${formData.principal.name}.
Please review the attached document and contact the user for further steps.
            `;

            await transporter.sendMail({
                from: `"Lexinco Drafting Tool" <${process.env.EMAIL_USER}>`,
                to: 'info@lexinco.com',
                subject: 'New Power of Attorney Generated',
                html: emailHtml,
                text: emailText,
                attachments: [
                    {
                        filename: 'drafted_power-of-attorney.pdf',
                        path: pdfPath,
                        contentType: 'application/pdf'
                    }
                ]
            });

            fs.unlinkSync(pdfPath);
            res.json({ success: true, content });
        });

    } catch (error) {
        console.error('Generate Power of Attorney Error:', error);
        res.status(500).json({ error: 'Failed to generate power of attorney', details: error.message });
    }
});

// Generate Partnership Agreement

app.post('/api/generate-partnership-agreement', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    try {
        if (!formData.partnership || !formData.partner1 || !formData.partner2 || !formData.businessPurpose || !formData.capitalContribution || !formData.profitSharingRatio || !formData.terms) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const prompt = `
You are an expert Indian legal draftsman. Draft a detailed, professional, multi-page "Partnership Agreement" under Indian law.
The draft must be long, comprehensive, and in formal legal language. Include expanded standard clauses:

- Recitals / Background
- Capital contribution
- Profit and loss sharing
- Banking and accounts clause
- Management and decision-making rights
- Admission, retirement, or death of partners
- Non-compete and confidentiality obligations
- Duration of partnership (at will / fixed term)
- Dissolution procedure
- Governing law and jurisdiction
- Miscellaneous (entire agreement, amendment, severability, counterparts, execution and witness section)

Use the following details accurately:

Partnership Name: ${formData.partnership.name}
Address: ${formData.partnership.address}
Partner 1: ${formData.partner1.name}, ${formData.partner1.address}, Contact: ${formData.partner1.contact || 'N/A'}, Email: ${formData.partner1.email || 'N/A'}
Partner 2: ${formData.partner2.name}, ${formData.partner2.address}, Contact: ${formData.partner2.contact || 'N/A'}, Email: ${formData.partner2.email || 'N/A'}
Business Purpose: ${formData.businessPurpose}
Capital Contribution: ${formData.capitalContribution}
Profit Sharing Ratio: ${formData.profitSharingRatio}
Terms: ${formData.terms}
Execution Date: ${todayDate}

Return only the fully formatted legal document text suitable for PDF generation.
`;


        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a professional Indian legal document drafter." },
                { role: "user", content: prompt }
            ],
            temperature: 0.4,
        });

        const content = response.choices[0].message.content;

        // Generate PDF
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const pdfPath = path.join(uploadDir, `drafted_partnership-agreement_${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);
        doc.fontSize(12).text(content, { align: "justify", lineGap: 6 });
        doc.end();

        writeStream.on('finish', async () => {
            const emailHtml = `<p>Dear Lexinco Team,</p><p>A new Partnership Agreement has been generated by ${formData.partner1.name} and ${formData.partner2.name}.</p>`;
            const emailText = `A new Partnership Agreement has been generated by ${formData.partner1.name} and ${formData.partner2.name}.`;

            await transporter.sendMail({
                from: `"Lexinco Drafting Tool" <${process.env.EMAIL_USER}>`,
                to: 'info@lexinco.com',
                subject: 'New Partnership Agreement Generated',
                html: emailHtml,
                text: emailText,
                attachments: [{ filename: 'drafted_partnership-agreement.pdf', path: pdfPath, contentType: 'application/pdf' }]
            });

            fs.unlinkSync(pdfPath);
            res.json({ success: true, content });
        });

    } catch (error) {
        console.error('Generate Partnership Agreement Error:', error);
        res.status(500).json({ error: 'Failed to generate partnership agreement', details: error.message });
    }
});

// Generate Lease Agreement
app.post('/api/generate-lease-agreement', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    try {
        if (!formData.lessor || !formData.lessee || !formData.property || !formData.rent || !formData.leaseTerm || !formData.terms) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const prompt = `
You are an expert Indian legal draftsman. Draft a detailed, professional, multi-page "Lease Agreement" under Indian law.
The draft must be long, comprehensive, and in formal legal language. Include expanded standard clauses:

- Recitals / Background
- Description of Property
- Lease Term
- Rent and payment details (mode, late fees if any)
- Security deposit
- Maintenance and repairs
- Utilities (electricity, water, society charges)
- Use of property (residential/commercial restriction)
- Subletting clause
- Condition of property on return
- Termination procedure
- Governing law and jurisdiction
- Miscellaneous (entire agreement, amendment, severability, counterparts, execution and witness section)

Use the following details accurately:

Lessor: ${formData.lessor.name}, ${formData.lessor.address}, Contact: ${formData.lessor.contact || 'N/A'}, Email: ${formData.lessor.email || 'N/A'}
Lessee: ${formData.lessee.name}, ${formData.lessee.address}, Contact: ${formData.lessee.contact || 'N/A'}, Email: ${formData.lessee.email || 'N/A'}
Property: ${formData.property.address}, Type: ${formData.property.type}
Rent: ${formData.rent}
Lease Term: ${formData.leaseTerm}
Terms: ${formData.terms}
Execution Date: ${todayDate}

Return only the fully formatted legal document text suitable for PDF generation.
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a professional Indian legal document drafter." },
                { role: "user", content: prompt }
            ],
            temperature: 0.4,
        });

        const content = response.choices[0].message.content;

        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const pdfPath = path.join(uploadDir, `drafted_lease-agreement_${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);
        doc.fontSize(12).text(content, { align: "justify", lineGap: 6 });
        doc.end();

        writeStream.on('finish', async () => {
            const emailHtml = `<p>Dear Lexinco Team,</p><p>A new Lease Agreement has been generated by ${formData.lessor.name}.</p>`;
            const emailText = `A new Lease Agreement has been generated by ${formData.lessor.name}.`;

            await transporter.sendMail({
                from: `"Lexinco Drafting Tool" <${process.env.EMAIL_USER}>`,
                to: 'info@lexinco.com',
                subject: 'New Lease Agreement Generated',
                html: emailHtml,
                text: emailText,
                attachments: [{ filename: 'drafted_lease-agreement.pdf', path: pdfPath, contentType: 'application/pdf' }]
            });

            fs.unlinkSync(pdfPath);
            res.json({ success: true, content });
        });

    } catch (error) {
        console.error('Generate Lease Agreement Error:', error);
        res.status(500).json({ error: 'Failed to generate lease agreement', details: error.message });
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

// app.post('/api/signup', async (req, res) => {
//     const { name, email, password, otp } = req.body;

//     try {
//         const otpResult = await pool.query(
//             'SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > NOW()',
//             [email, otp]
//         );
//         if (otpResult.rows.length === 0) {
//             return res.status(400).json({ error: 'Invalid/expired OTP. Please request a new one.' });
//         }

//         const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
//         if (userResult.rows.length > 0) {
//             return res.status(400).json({ error: 'User already exists' });
//         }

//         const passwordHash = await bcrypt.hash(password, 10);
//         const userId = uuidv4();
//         const insertResult = await pool.query(
//             'INSERT INTO users (user_id, name, email, password_hash, is_verified) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email',
//             [userId, name, email, passwordHash, true]
//         );

//         await pool.query('DELETE FROM otps WHERE email = $1', [email]);

//         res.json({ success: true, user: insertResult.rows[0] });
//     } catch (error) {
//         console.error('Signup Error:', error);
//         res.status(500).json({ error: 'Signup failed', details: error.message });
//     }
// });

// app.post('/api/login', async (req, res) => {
//     const { email, password } = req.body;

//     try {
//         const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
//         if (result.rows.length === 0) {
//             return res.status(401).json({ error: 'Invalid credentials' });
//         }

//         const user = result.rows[0];
//         const isValid = await bcrypt.compare(password, user.password_hash);
//         if (!isValid) {
//             return res.status(401).json({ error: 'Invalid credentials' });
//         }

//         res.json({
//             success: true,
//             user: { id: user.user_id, name: user.name, email: user.email }
//         });
//     } catch (error) {
//         console.error('Login Error:', error);
//         res.status(500).json({ error: 'Login failed', details: error.message });
//     }
// });

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
            createdAt: notice.created_at
        });
    } catch (error) {
        console.error('Get Notice Error:', error);
        res.status(500).json({ error: 'Failed to fetch notice', details: error.message });
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
        const status = 'generated';
        const sendAt = null;

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

        await transporter.sendMail({
            from: `"Lexinco" <${process.env.EMAIL_USER}>`,
            to: 'info@lexinco.com',
            subject: 'New Legal Notice Generated',
            text: `A new legal notice has been generated.\n\nUser Details:\nName: ${client.name}\nEmail: ${client.email}\nContact: ${client.contact}\nAddress: ${client.address}\n\nNotice ID: ${noticeId}\n\nPlease review the attached notice and contact the user for further steps.`,
            attachments: [
                {
                    filename: 'legal_notice.pdf',
                    path: pdfPath,
                    contentType: 'application/pdf'
                }
            ]
        });

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

        res.json({ success: true });
    } catch (error) {
        console.error('Send Notice Error:', error);
        res.status(500).json({ error: 'Failed to send notice', details: error.message });
    }
});

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

        const fileUrl = `${process.env.HEROKU_APP_URL || `http://localhost:${process.env.PORT || 3000}`}/Uploads/${newFilename}`;
        res.json({ success: true, url: fileUrl });
    } catch (error) {
        console.error('Upload PDF Error:', error);
        res.status(500).json({ error: 'Failed to upload PDF', details: error.message });
    }
});

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

app.post('/api/proxy/blog-access', async (req, res) => {
    try {
        const googleAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbxYqGabKKf6ImXqmiPHMeeWiI7WGFqDob46Ped4DuPSmQCz9MN8rKCQZAkKzaBH7zL-/exec';
        const response = await axios.post(googleAppsScriptUrl, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Blog Access Proxy Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to submit blog access request', details: error.message });
    }
});

// Static Middleware (moved after API routes)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

// Catch-all route for unmatched requests
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});