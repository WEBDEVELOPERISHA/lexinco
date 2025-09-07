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
const axios = require('axios');
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

// API Routes
app.get('/api/config', (req, res) => {
    res.json({});
});

app.post('/api/generate-sale-agreement', async (req, res) => {
    console.log('Received request to /api/generate-sale-agreement with body:', req.body);
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    if (!formData.seller || !formData.buyer || !formData.product || !formData.delivery || !formData.paymentMode) {
        console.error('Invalid form data:', formData);
        return res.status(400).json({ error: 'Invalid form data', details: 'Missing seller, buyer, product, delivery, or paymentMode data' });
    }

    if (!Number.isFinite(formData.product.totalPrice) || formData.product.totalPrice < 0) {
        console.error('Invalid totalPrice:', formData.product.totalPrice);
        return res.status(400).json({ error: 'Invalid totalPrice', details: 'Total price must be a valid non-negative number' });
    }

    const template = `
SALES AGREEMENT

THIS SALES AGREEMENT (“Agreement”) is made and executed on this ${todayDate} at ${formData.executionPlace || 'Mumbai'},
BY AND BETWEEN:

**${formData.seller.name}**, son/daughter of ${formData.seller.fatherName}, residing at ${formData.seller.address}, hereinafter referred to as the "Seller" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns);

AND

**${formData.buyer.name}**, son/daughter of ${formData.buyer.fatherName}, residing at ${formData.buyer.address}, hereinafter referred to as the "Buyer" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns).

(The Seller and the Buyer are hereinafter collectively referred to as the "Parties" and individually as a "Party").

WHEREAS:

1. The Seller is the absolute owner and in lawful possession of the goods more particularly described hereunder.
2. The Buyer has approached the Seller to purchase the said goods, and the Seller has agreed to sell the same subject to the terms and conditions contained herein.

NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:

**1. DESCRIPTION OF GOODS**
The Seller agrees to sell, transfer, and deliver to the Buyer the following goods:
${formData.product.description}.

**2. CONSIDERATION & PAYMENT**
a) The total consideration for the sale of the aforesaid goods shall be Rs. ${formData.product.totalPrice} (Rupees ${numberToWords(formData.product.totalPrice)}).
b) The Buyer agrees to pay the aforesaid consideration to the Seller as follows:
   i. Rs. ${formData.product.price} per unit for a total of ${formData.product.quantity} units.
   ii. Mode of payment: ${formData.paymentMode}.
c) The Parties agree that time is the essence of payment. Delay in payment shall attract interest at 1% per month until realization.

**3. DELIVERY**
a) The Seller shall deliver the goods to the Buyer at ${formData.delivery.address} on or before ${formData.delivery.date}.
b) Risk in respect of the goods shall pass to the Buyer upon delivery.
c) Title shall pass only upon full and final payment of consideration.

**4. REPRESENTATIONS & WARRANTIES**
The Seller hereby covenants, represents, and warrants that:
a) The goods are free from all encumbrances, liens, or third-party claims.
b) The goods conform to the description and are fit for the intended purpose.
c) The Seller has full authority to sell the goods and execute this Agreement.

**5. INDEMNITY**
The Seller shall indemnify and keep indemnified the Buyer against any claims, demands, losses, damages, or expenses arising due to defect in title or breach of the Seller’s warranties.

**6. BREACH & REMEDIES**
a) In the event of breach of any term of this Agreement, the aggrieved Party shall be entitled to specific performance, damages, or such other remedies as available under the Indian Contract Act, 1872 and the Sale of Goods Act, 1930.
b) The defaulting Party shall also be liable to bear all costs, charges, and expenses including legal costs incurred by the aggrieved Party.

**7. GOVERNING LAW & JURISDICTION**
This Agreement shall be governed by and construed in accordance with the laws of India. The Courts at ${formData.jurisdiction || 'Mumbai'} shall have exclusive jurisdiction over any disputes arising out of or in connection with this Agreement.

IN WITNESS WHEREOF, the Parties hereto have hereunto set their respective hands on the day, month, and year first above written.

__________________________          __________________________
Seller (Signature & Name)           Buyer (Signature & Name)
`;

    const prompt = `
You are a senior legal assistant with 20+ years of experience in Indian commercial law.

Your task is to draft a **formal Sales Agreement** based on the provided form data. The agreement must:
- Be **legally enforceable** under Indian law.
- Use **precise legal terminology** (e.g., "party of the first part", "covenants", "indemnify", "consideration", "specific performance").
- Reference applicable laws such as the **Indian Contract Act, 1872** and the **Sale of Goods Act, 1930**.
- Strictly follow the structure of the template provided below. Do not add or remove sections.
- Expand each section into detailed contractual clauses suitable for a professional legal agreement.

**Form Data**:
- Seller: ${formData.seller.name}, ${formData.seller.address}, ${formData.seller.contact}
- Buyer: ${formData.buyer.name}, ${formData.buyer.address}, ${formData.buyer.contact}
- Product: ${formData.product.description}, Quantity: ${formData.product.quantity}, Price per unit: Rs. ${formData.product.price}, Total: Rs. ${formData.product.totalPrice}
- Delivery: ${formData.delivery.address}, Date: ${formData.delivery.date}
- Payment Mode: ${formData.paymentMode}

**Template to Follow**:
${template}

**Instructions**:
1. Insert detailed legal drafting language for each clause while keeping the structure intact.
2. Use Indian legal style (formal, verbose, contractual).
3. Do not add commentary, explanations, or formatting outside the Agreement text.
4. Output only the completed Agreement.
`;

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }

        console.log('Sending request to OpenAI API...');
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

        console.log('Received response from OpenAI:', response.data);
        let content = response.data.choices[0].message.content;

        const expectedStart = `SALES AGREEMENT`;
        const expectedEnd = `Seller (Signature & Name)           Buyer (Signature & Name)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template;
        }

        content = content
            .replace(/\n\n/g, '<p>')
            .replace(/\n/g, '<br>')
            .replace(/\t/g, '    ')
            .replace('[Insert Amount in Words]', numberToWords(formData.product.totalPrice));

        res.json({ content });
    } catch (error) {
        console.error('OpenAI API Error:', {
            message: error.message,
            response: error.response ? error.response.data : null,
            status: error.response ? error.response.status : null
        });
        res.status(500).json({
            error: 'Failed to generate sale agreement',
            details: error.response?.data?.error?.message || error.message
        });
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

    const template = `
BY REGISTERED /POST/EMAIL

                                                             Date: ${todayDate}

To,  
${formData.recipient.name}  
${formData.recipient.address}

Subject: Legal Notice regarding Dispute

Under the instructions and authority from my client ${formData.client.name}, residing at ${formData.client.address}, Mobile: ${formData.client.contact}, I hereby address you as follows:

That my client and you entered into a transaction/understanding, as described: ${formData.dispute.issueDescription}.  

That my client fulfilled all obligations as agreed under the understanding/transaction.  

That you were obligated to act as per the understanding but failed to do so.  

That despite repeated follow-ups, no satisfactory resolution was offered.  

That such failure indicates breach of trust.  

That my client has suffered losses and inconvenience, as described: ${formData.dispute.damages}.  

That your conduct constitutes a legal wrong under applicable Indian laws, including but not limited to the Indian Contract Act, 1872.  

That my client hereby demands that the dispute be resolved immediately by [specify action, e.g., payment of dues, performance of obligations].  

That if you fail to act within 7 days from the receipt of this notice, legal proceedings (civil and/or criminal) will be initiated at your risk.  

That you shall be liable for all litigation costs, damages, and consequences arising from your failure to comply.  

That this legal notice serves as a final opportunity for resolution.  

This legal notice is issued to you without prejudice to all other legal rights and remedies available to my client under the law.

Kindly treat this as a final and urgent notice.

For ${formData.client.name}  
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
- Client Name: ${formData.client.name}
- Client Address: ${formData.client.address}
- Client Contact: ${formData.client.contact}
- Recipient Name: ${formData.recipient.name}
- Recipient Address: ${formData.recipient.address}
- Issue Description: ${formData.dispute.issueDescription}
- Damages Suffered: ${formData.dispute.damages}

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

        const expectedStart = `BY REGISTERED /POST/EMAIL`;
        const expectedEnd = `(Advocate Shalini Tripathi)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template;
        }

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
app.post('/api/generate-advocate-notice', async (req, res) => {
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Validate form data
    if (!formData.client || !formData.recipient || !formData.dispute) {
        console.error('Invalid form data:', formData);
        return res.status(400).json({ error: 'Invalid form data', details: 'Missing client, recipient, or dispute data' });
    }

    // Legal notice template
    const template = `
BY REGISTERED /POST/EMAIL

                                                             Date: ${todayDate}

To,  
${formData.recipient.name}  
${formData.recipient.address}

Subject: Legal Notice regarding ${formData.dispute.relationship.charAt(0).toUpperCase() + formData.dispute.relationship.slice(1).replace(/-/g, ' ')}

Under the instructions and authority from my client ${formData.client.name}, residing at ${formData.client.address}, Mobile: ${formData.client.contact}, Email: ${formData.client.email}, I, Advocate Shalini L Tripathi, hereby address you as follows:

That my client and you entered into a transaction/understanding, as described: ${formData.dispute.issueDescription}.  

That my client fulfilled all obligations as agreed under the understanding/transaction.  

That you were obligated to act as per the understanding but failed to do so.  

That despite repeated follow-ups, no satisfactory resolution was offered.  

That such failure indicates breach of trust and/or contractual obligations.  

That my client has suffered losses and inconvenience, as described: ${formData.dispute.damages}.  

That your conduct constitutes a legal wrong under applicable Indian laws, including but not limited to the Indian Contract Act, 1872, and other relevant statutes.  

That my client hereby demands that the dispute be resolved immediately by ${formData.dispute.damages}.  

That if you fail to comply within 7 days from the receipt of this notice, legal proceedings (civil and/or criminal) will be initiated at your risk and cost.  

That you shall be liable for all litigation costs, damages, and consequences arising from your failure to comply.  

That this legal notice serves as a final opportunity for resolution.  

This legal notice is issued to you without prejudice to all other legal rights and remedies available to my client under the law.

Kindly treat this as a final and urgent notice.

For ${formData.client.name}  
Through his Legal Counsel,  

(Advocate Shalini L Tripathi)
`;

    // Prompt for OpenAI
    const prompt = `
You are a senior legal assistant with 20+ years of experience in Indian civil and contractual legal matters, assisting Advocate Shalini L Tripathi.

Your task is to draft a **formal legal notice** for an advocate based on the provided form data. The notice must:
- Be comprehensive (approx. 1200–1500 words, around 4 A4 pages).
- Use **Indian legal language** with a ${formData.dispute.tone} tone (formal, assertive, or conciliatory).
- Be suitable for court/legal submission in India.
- Reference relevant laws (e.g., Indian Contract Act, 1872, or other statutes like the Specific Relief Act, 1963, where applicable).
- **EXACTLY** follow the structure provided below, without adding, removing, or modifying any sections, headers, or formatting. Every paragraph after the introductory statement must start with "That". Do not include any additional text, explanations, or markdown symbols outside the template. Do not include letterhead or signatures, as these are added separately by the frontend.

**Form Data**:
- Client Name: ${formData.client.name}
- Client Address: ${formData.client.address}
- Client Contact: ${formData.client.contact}
- Client Email: ${formData.client.email}
- Recipient Name: ${formData.recipient.name}
- Recipient Address: ${formData.recipient.address}
- Recipient Contact: ${formData.recipient.contact}
- Recipient Email: ${formData.recipient.email}
- Notice Type: ${formData.dispute.relationship}
- Issue Description: ${formData.dispute.issueDescription}
- Key Events: ${formData.dispute.keyEvents}
- Damages Sought: ${formData.dispute.damages}
- Tone: ${formData.dispute.tone}

**Template to Follow**:
${template}

**Instructions**:
1. Fill in the placeholders in the template with detailed content based on the form data.
2. For the paragraph starting with "That my client and you entered into a transaction/understanding, as described:", provide a detailed elaboration based on the issue description and key events, including specific dates, agreements, or actions where relevant.
3. For the paragraph starting with "That my client has suffered losses and inconvenience, as described:", elaborate on the damages suffered, quantifying losses (e.g., monetary, emotional, or reputational) where possible.
4. For the paragraph starting with "That my client hereby demands...", specify a clear and precise action (e.g., payment of Rs. X, performance of specific obligations, cessation of actions) based on the damages sought.
5. For the paragraph referencing applicable laws, include specific sections of the Indian Contract Act, 1872 (e.g., Section 73 for breach of contract damages) or other relevant laws based on the notice type (e.g., Defamation under Section 499 IPC for defamation notices).
6. Ensure each "That" paragraph is detailed, legally precise, and contextually relevant to the dispute, maintaining the specified tone.
7. Output **only** the filled-in template, with no additional text or formatting.
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o",
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
        const expectedEnd = `(Advocate Shalini L Tripathi)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template; // Fallback to template if structure is incorrect
        }

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
            error: 'Failed to generate advocate notice',
            details: error.response?.data?.error?.message || error.message
        });
    }
});
app.post('/api/generate-power-of-attorney', async (req, res) => {
    console.log('Received request to /api/generate-power-of-attorney with body:', req.body);
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    if (!formData.principal || !formData.attorney || !formData.powerType || !formData.purpose || !formData.duration) {
        console.error('Invalid form data:', formData);
        return res.status(400).json({ error: 'Invalid form data', details: 'Missing principal, attorney, powerType, purpose, or duration data' });
    }

    const template = `
POWER OF ATTORNEY

THIS POWER OF ATTORNEY is made and executed on this ${todayDate} at Mumbai,
BY:

**${formData.principal.name}**, residing at ${formData.principal.address}, hereinafter referred to as the "Principal" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns).

IN FAVOUR OF:

**${formData.attorney.name}**, residing at ${formData.attorney.address}, hereinafter referred to as the "Attorney" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns).

WHEREAS:

1. The Principal desires to appoint the Attorney to act on his/her behalf for the purposes specified herein.
2. The Attorney has agreed to accept the appointment and act in accordance with the instructions provided by the Principal.

NOW THIS POWER OF ATTORNEY WITNESSETH AS FOLLOWS:

**1. APPOINTMENT**
The Principal hereby appoints the Attorney to act as his/her true and lawful attorney to perform the following acts, deeds, and things: ${formData.purpose}.

**2. TYPE OF POWER**
This Power of Attorney is a ${formData.powerType}, and the Attorney shall have the authority to act within the scope defined herein.

**3. DURATION**
This Power of Attorney shall remain in force for ${formData.duration}, unless revoked earlier by the Principal in writing.

**4. REVOCATION**
The Principal reserves the right to revoke this Power of Attorney at any time by providing written notice to the Attorney.

**5. INDEMNITY**
The Attorney shall not be liable for any act done in good faith in the exercise of the powers granted herein, and the Principal shall indemnify the Attorney against any claims or losses arising from such acts.

**6. GOVERNING LAW**
This Power of Attorney shall be governed by and construed in accordance with the laws of India, particularly the Powers of Attorney Act, 1882. The Courts at Mumbai shall have exclusive jurisdiction over any disputes arising hereunder.

IN WITNESS WHEREOF, the Principal has hereunto set his/her hand on the day, month, and year first above written.

__________________________
Principal (Signature & Name)
`;

    const prompt = `
You are a senior legal assistant with 20+ years of experience in Indian legal drafting.

Your task is to draft a **formal Power of Attorney** based on the provided form data. The document must:
- Be **legally enforceable** under Indian law, particularly the Powers of Attorney Act, 1882.
- Use **precise legal terminology** (e.g., "Principal", "Attorney", "act, deed, and thing").
- Reference applicable laws where relevant.
- Strictly follow the structure of the template provided below. Do not add or remove sections.
- Expand each section into detailed contractual clauses suitable for a professional legal document.

**Form Data**:
- Principal: ${formData.principal.name}, ${formData.principal.address}
- Attorney: ${formData.attorney.name}, ${formData.attorney.address}
- Power Type: ${formData.powerType}
- Purpose: ${formData.purpose}
- Duration: ${formData.duration}

**Template to Follow**:
${template}

**Instructions**:
1. Insert detailed legal drafting language for each clause while keeping the structure intact.
2. Use Indian legal style (formal, verbose, contractual).
3. Ensure the purpose is elaborated with specific powers and scope based on the provided purpose.
4. Do not add commentary, explanations, or formatting outside the Agreement text.
5. Output only the completed Power of Attorney.
`;

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }

        console.log('Sending request to OpenAI API for Power of Attorney...');
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

        console.log('Received response from OpenAI:', response.data);
        let content = response.data.choices[0].message.content;

        const expectedStart = `POWER OF ATTORNEY`;
        const expectedEnd = `Principal (Signature & Name)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template;
        }

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
            error: 'Failed to generate power of attorney',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

// Generate Partnership Agreement
app.post('/api/generate-partnership-agreement', async (req, res) => {
    console.log('Received request to /api/generate-partnership-agreement with body:', req.body);
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    if (!formData.partnership || !formData.partner1 || !formData.partner2 || !formData.businessPurpose || !formData.capitalContribution || !formData.profitSharingRatio || !formData.terms) {
        console.error('Invalid form data:', formData);
        return res.status(400).json({ error: 'Invalid form data', details: 'Missing partnership, partner1, partner2, businessPurpose, capitalContribution, profitSharingRatio, or terms data' });
    }

    const template = `
PARTNERSHIP AGREEMENT

THIS PARTNERSHIP AGREEMENT (“Agreement”) is made and executed on this ${todayDate} at Mumbai,
BY AND BETWEEN:

**${formData.partner1.name}**, residing at ${formData.partnership.address}, hereinafter referred to as the "First Partner" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns);

AND

**${formData.partner2.name}**, residing at ${formData.partnership.address}, hereinafter referred to as the "Second Partner" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns).

(The First Partner and the Second Partner are hereinafter collectively referred to as the "Partners" and individually as a "Partner").

WHEREAS:

1. The Partners desire to form a partnership firm under the name and style of "${formData.partnership.name}" for the purpose of carrying on the business described herein.
2. The Partners have agreed to contribute capital, share profits and losses, and manage the business as per the terms set forth below.

NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:

**1. NAME AND PLACE OF BUSINESS**
The partnership firm shall be carried on under the name "${formData.partnership.name}" and its principal place of business shall be at ${formData.partnership.address}.

**2. BUSINESS PURPOSE**
The business of the partnership shall be: ${formData.businessPurpose}.

**3. CAPITAL CONTRIBUTION**
a) The total capital contribution to the partnership shall be Rs. ${formData.capitalContribution} (Rupees ${numberToWords(formData.capitalContribution)}).
b) Each Partner shall contribute equally or as agreed to the capital of the partnership.

**4. PROFIT AND LOSS SHARING**
The profits and losses of the partnership shall be shared in the ratio of ${formData.profitSharingRatio}.

**5. MANAGEMENT**
The Partners shall have equal rights in the management of the partnership business, unless otherwise specified herein: ${formData.terms}.

**6. DISSOLUTION**
The partnership may be dissolved by mutual consent of the Partners or as per the provisions of the Indian Partnership Act, 1932.

**7. GOVERNING LAW**
This Agreement shall be governed by and construed in accordance with the laws of India, particularly the Indian Partnership Act, 1932. The Courts at Mumbai shall have exclusive jurisdiction over any disputes arising hereunder.

IN WITNESS WHEREOF, the Partners hereto have hereunto set their respective hands on the day, month, and year first above written.

__________________________          __________________________
First Partner (Signature & Name)    Second Partner (Signature & Name)
`;

    const prompt = `
You are a senior legal assistant with 20+ years of experience in Indian commercial law.

Your task is to draft a **formal Partnership Agreement** based on the provided form data. The agreement must:
- Be **legally enforceable** under Indian law, particularly the Indian Partnership Act, 1932.
- Use **precise legal terminology** (e.g., "Partners", "capital contribution", "profit sharing").
- Reference applicable laws where relevant.
- Strictly follow the structure of the template provided below. Do not add or remove sections.
- Expand each section into detailed contractual clauses suitable for a professional legal agreement.

**Form Data**:
- Partnership Name: ${formData.partnership.name}
- Partnership Address: ${formData.partnership.address}
- Partner 1: ${formData.partner1.name}
- Partner 2: ${formData.partner2.name}
- Business Purpose: ${formData.businessPurpose}
- Capital Contribution: Rs. ${formData.capitalContribution}
- Profit Sharing Ratio: ${formData.profitSharingRatio}
- Terms: ${formData.terms}

**Template to Follow**:
${template}

**Instructions**:
1. Insert detailed legal drafting language for each clause while keeping the structure intact.
2. Use Indian legal style (formal, verbose, contractual).
3. Elaborate the business purpose and terms with specific details based on the provided data.
4. Do not add commentary, explanations, or formatting outside the Agreement text.
5. Output only the completed Partnership Agreement.
`;

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }

        console.log('Sending request to OpenAI API for Partnership Agreement...');
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

        console.log('Received response from OpenAI:', response.data);
        let content = response.data.choices[0].message.content;

        const expectedStart = `PARTNERSHIP AGREEMENT`;
        const expectedEnd = `First Partner (Signature & Name)    Second Partner (Signature & Name)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template;
        }

        content = content
            .replace(/\n\n/g, '<p>')
            .replace(/\n/g, '<br>')
            .replace(/\t/g, '    ')
            .replace('[Insert Amount in Words]', numberToWords(formData.capitalContribution));

        res.json({ content });
    } catch (error) {
        console.error('OpenAI API Error:', {
            message: error.message,
            response: error.response ? error.response.data : null,
            status: error.response ? error.response.status : null
        });
        res.status(500).json({
            error: 'Failed to generate partnership agreement',
            details: error.response?.data?.error?.message || error.message
        });
    }
});

// Generate Lease Agreement
app.post('/api/generate-lease-agreement', async (req, res) => {
    console.log('Received request to /api/generate-lease-agreement with body:', req.body);
    const formData = req.body;
    const todayDate = new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    if (!formData.lessor || !formData.lessee || !formData.property || !formData.rent || !formData.leaseTerm || !formData.terms) {
        console.error('Invalid form data:', formData);
        return res.status(400).json({ error: 'Invalid form data', details: 'Missing lessor, lessee, property, rent, leaseTerm, or terms data' });
    }

    const template = `
LEASE AGREEMENT

THIS LEASE AGREEMENT (“Agreement”) is made and executed on this ${todayDate} at Mumbai,
BY AND BETWEEN:

**${formData.lessor.name}**, residing at ${formData.lessor.address}, hereinafter referred to as the "Lessor" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns);

AND

**${formData.lessee.name}**, residing at ${formData.lessee.address}, hereinafter referred to as the "Lessee" (which expression shall, unless repugnant to the context or meaning thereof, include his/her heirs, legal representatives, successors, and assigns).

(The Lessor and the Lessee are hereinafter collectively referred to as the "Parties" and individually as a "Party").

WHEREAS:

1. The Lessor is the absolute owner and in lawful possession of the property described hereunder.
2. The Lessee has approached the Lessor to lease the said property, and the Lessor has agreed to lease the same subject to the terms and conditions contained herein.

NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:

**1. DESCRIPTION OF PROPERTY**
The Lessor agrees to lease to the Lessee the following property: ${formData.property.address}, being a ${formData.property.type} property.

**2. LEASE TERM**
The lease shall commence on ${todayDate} and continue for a period of ${formData.leaseTerm}.

**3. RENT**
a) The Lessee shall pay to the Lessor a monthly rent of Rs. ${formData.rent} (Rupees ${numberToWords(formData.rent)}).
b) The rent shall be payable on or before the 5th day of each month.

**4. TERMS AND CONDITIONS**
The Parties agree to the following terms and conditions: ${formData.terms}.

**5. MAINTENANCE AND REPAIRS**
The Lessee shall be responsible for routine maintenance and minor repairs, unless otherwise agreed.

**6. TERMINATION**
The lease may be terminated by either Party by giving one month’s written notice, or as per the terms specified herein.

**7. GOVERNING LAW**
This Agreement shall be governed by and construed in accordance with the laws of India, particularly the Transfer of Property Act, 1882. The Courts at Mumbai shall have exclusive jurisdiction over any disputes arising hereunder.

IN WITNESS WHEREOF, the Parties hereto have hereunto set their respective hands on the day, month, and year first above written.

__________________________          __________________________
Lessor (Signature & Name)           Lessee (Signature & Name)
`;

    const prompt = `
You are a senior legal assistant with 20+ years of experience in Indian property law.

Your task is to draft a **formal Lease Agreement** based on the provided form data. The agreement must:
- Be **legally enforceable** under Indian law, particularly the Transfer of Property Act, 1882.
- Use **precise legal terminology** (e.g., "Lessor", "Lessee", "demised premises").
- Reference applicable laws where relevant.
- Strictly follow the structure of the template provided below. Do not add or remove sections.
- Expand each section into detailed contractual clauses suitable for a professional legal agreement.

**Form Data**:
- Lessor: ${formData.lessor.name}, ${formData.lessor.address}
- Lessee: ${formData.lessee.name}, ${formData.lessee.address}
- Property: ${formData.property.address}, Type: ${formData.property.type}
- Rent: Rs. ${formData.rent}
- Lease Term: ${formData.leaseTerm}
- Terms: ${formData.terms}

**Template to Follow**:
${template}

**Instructions**:
1. Insert detailed legal drafting language for each clause while keeping the structure intact.
2. Use Indian legal style (formal, verbose, contractual).
3. Elaborate the terms and conditions with specific details based on the provided data.
4. Do not add commentary, explanations, or formatting outside the Agreement text.
5. Output only the completed Lease Agreement.
`;

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }

        console.log('Sending request to OpenAI API for Lease Agreement...');
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

        console.log('Received response from OpenAI:', response.data);
        let content = response.data.choices[0].message.content;

        const expectedStart = `LEASE AGREEMENT`;
        const expectedEnd = `Lessor (Signature & Name)           Lessee (Signature & Name)`;
        if (!content.startsWith(expectedStart) || !content.endsWith(expectedEnd)) {
            console.warn('OpenAI response does not match expected structure:', content.substring(0, 100) + '...');
            content = template;
        }

        content = content
            .replace(/\n\n/g, '<p>')
            .replace(/\n/g, '<br>')
            .replace(/\t/g, '    ')
            .replace('[Insert Amount in Words]', numberToWords(formData.rent));

        res.json({ content });
    } catch (error) {
        console.error('OpenAI API Error:', {
            message: error.message,
            response: error.response ? error.response.data : null,
            status: error.response ? error.response.status : null
        });
        res.status(500).json({
            error: 'Failed to generate lease agreement',
            details: error.response?.data?.error?.message || error.message
        });
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