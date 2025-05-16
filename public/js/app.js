const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = isLocal ? 'http://localhost:3000' : '';
let savedSenderName = '';

const config = {};
const form = document.getElementById('noticeForm');
const steps = document.querySelectorAll('.form-step');
const progressSteps = document.querySelectorAll('.progress-steps .step');
const signaturePadCanvas = document.getElementById('signature-pad');
const loadingOverlay = document.getElementById('loadingOverlay');
const legalNoticeDiv = document.getElementById('legalNotice');
const formContainer = document.querySelector('.notice-form');
const noticePage = document.getElementById('noticePage');

let currentStep = 0;
let currentNoticeId = null;
let paymentDetails = null;
let signaturePad = null;
let razorpayKeyId = null;
const svgLetterhead = `
<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff"/>
  <!-- Border bottom -->
  <line x1="20" y1="190" x2="780" y2="190" stroke="#000000" stroke-width="2"/>
  <!-- Advocate Name -->
  <text x="50%" y="50" font-size="24" font-weight="bold" text-anchor="middle" fill="#000000">
    Adv. Shalini L Tripathi
  </text>
  <!-- Qualification -->
  <text x="50%" y="75" font-size="16" text-anchor="middle" fill="#333333">
    B.Com, LLB
  </text>
  <!-- Contact Details -->
  <text x="50%" y="105" font-size="14" text-anchor="middle" fill="#000000">
    Contact: 9552446231 | Email: info@lexinco.com
  </text>
  <!-- Address -->
  <text x="50%" y="125" font-size="14" text-anchor="middle" fill="#000000">
    204, Poonam Aster, Poonam Nagar, Virar West, Palghar 401303
  </text>
  <!-- License Number -->
  <text x="50%" y="150" font-size="14" text-anchor="middle" fill="#000000">
    License No: MAH/9337/2024
  </text>
</svg>`;

// Convert SVG to PNG data URL
async function svgToDataUrl(svgStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    await new Promise(resolve => {
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve();
        };
        img.src = url;
    });

    return canvas.toDataURL('image/png');
}

// Fetch configuration from server
async function loadConfig() {
    try {
        const response = await fetch(`${BASE_URL}/api/config`);
        const data = await response.json();
        razorpayKeyId = data.razorpayKeyId;
    } catch (error) {
        console.error('Error loading config:', error);
        alert('Failed to load configuration. Please refresh the page.');
    }
}

// Initialize Signature Pad
function initializeSignaturePad() {
    if (!signaturePadCanvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    signaturePadCanvas.width = signaturePadCanvas.offsetWidth * ratio;
    signaturePadCanvas.height = signaturePadCanvas.offsetHeight * ratio;
    signaturePadCanvas.getContext('2d').scale(ratio, ratio);

    signaturePad = new SignaturePad(signaturePadCanvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
        minWidth: 1,
        maxWidth: 2.5,
        throttle: 16
    });

    window.addEventListener('resize', handleCanvasResize);
}

function handleCanvasResize() {
    if (!signaturePadCanvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const oldData = signaturePad.toData();

    signaturePadCanvas.width = signaturePadCanvas.offsetWidth * ratio;
    signaturePadCanvas.height = signaturePadCanvas.offsetHeight * ratio;
    signaturePadCanvas.getContext('2d').scale(ratio, ratio);

    signaturePad.clear();
    signaturePad.fromData(oldData);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async function () {
    await loadConfig(); // Load Razorpay key
    initializeSignaturePad();

    document.querySelectorAll('.progress-steps .step').forEach((step, index) => {
        step.addEventListener('click', () => {
            if (index <= currentStep) {
                showStep(index + 1);
            }
        });
    });

    document.querySelectorAll('.next-step').forEach(button => {
        button.addEventListener('click', function () {
            if (currentStep === 3) {
                setTimeout(initializeSignaturePad, 100);
            }
        });
    });

    const urlParams = new URLSearchParams(window.location.search);
    const noticeId = urlParams.get('id');
    if (noticeId) {
        loadNoticeDetails(noticeId);
    } else {
        showForm();
    }
});

// Load notice details based on noticeId
async function loadNoticeDetails(noticeId) {
    try {
        showLoading(true);
        const response = await fetch(`/api/get-notice/${noticeId}`);
        const notice = await response.json();

        if (notice && notice.content) {
            legalNoticeDiv.innerHTML = notice.content;
            currentNoticeId = noticeId;
            formContainer.style.display = 'none';
            noticePage.style.display = 'block';

            // Enable buttons regardless of payment status
            updateUIAfterPayment(true);
        } else {
            alert('Notice content not found');
            showForm();
        }
    } catch (error) {
        console.error('Error loading notice:', error);
        alert('Failed to load notice details');
        showForm();
    } finally {
        showLoading(false);
    }
}

// Form Step Navigation
function showStep(stepIndex) {
    const index = parseInt(stepIndex) - 1;
    if (index < 0 || index >= steps.length) return;

    currentStep = index;

    steps.forEach(step => step.classList.remove('active'));
    steps[currentStep].classList.add('active');

    progressSteps.forEach((step, i) => {
        step.classList.toggle('active', i <= currentStep);
    });

    window.scrollTo({
        top: form.offsetTop - 100,
        behavior: 'smooth'
    });
}

function nextStep() {
    if (validateStep(currentStep)) {
        currentStep++;
        if (currentStep >= steps.length) currentStep = steps.length - 1;
        showStep(currentStep + 1);
    }
}

function prevStep() {
    currentStep--;
    if (currentStep < 0) currentStep = 0;
    showStep(currentStep + 1);
}

function validateStep(stepIndex) {
    const currentStep = steps[stepIndex];
    const inputs = currentStep.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;

    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('error');
            isValid = false;
        } else {
            input.classList.remove('error');
        }
    });

    if (!isValid) alert('Please fill in all required fields before proceeding.');
    return isValid;
}

// Clear Signature
function clearSignature() {
    if (signaturePad) signaturePad.clear();
}

// Form Submission
form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateStep(currentStep)) return;
    await generateLegalNotice();
});

// Handle Payment and Send (kept for future use)
async function initiatePaymentAndSend() {
    try {
        showLoading(true);

        if (noticePage.style.display === 'block' && currentNoticeId) {
            await handlePayment();
        } else {
            if (!validateAllSteps()) {
                showLoading(false);
                return;
            }

            const noticeId = await saveNoticeToServer();
            currentNoticeId = noticeId;
            window.history.pushState({}, '', `?id=${currentNoticeId}`);
            await handlePayment();
        }
    } catch (error) {
        console.error('Payment initiation error:', error);
        alert('Error: ' + error.message);
        showLoading(false);
    }
}

// Validate all steps
function validateAllSteps() {
    for (let i = 0; i < steps.length; i++) {
        if (!validateStep(i)) {
            showStep(i + 1);
            return false;
        }
    }
    return true;
}

// Payment Handling (kept for future use)
async function handlePayment() {
    try {
        showLoading(true);
        const orderResponse = await fetch(`${BASE_URL}/api/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noticeId: currentNoticeId })
        });

        if (!orderResponse.ok) {
            const error = await orderResponse.json();
            throw new Error(error.error || 'Failed to create payment order');
        }

        const orderData = await orderResponse.json();

        const options = {
            key: razorpayKeyId,
            amount: orderData.amount,
            currency: 'INR',
            order_id: orderData.id,
            name: 'Lexinco Legal Notice',
            description: 'Payment for legal notice delivery',
            prefill: {
                name: document.getElementById('senderName').value,
                email: document.getElementById('senderEmail').value,
                contact: document.getElementById('senderContact').value
            },
            handler: async function (response) {
                try {
                    await fetch(`${BASE_URL}/api/update-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            noticeId: currentNoticeId,
                            status: 'completed',
                            paymentId: response.razorpay_payment_id,
                            orderId: response.razorpay_order_id
                        })
                    });

                    updateUIAfterPayment(true, {
                        orderId: response.razorpay_order_id,
                        paymentId: response.razorpay_payment_id
                    });

                    generatePDF();
                    const invoiceBlob = await generateInvoicePDF(response);
                    const invoiceUrl = URL.createObjectURL(invoiceBlob);
                    const a = document.createElement('a');
                    a.href = invoiceUrl;
                    a.download = 'payment_receipt.pdf';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(invoiceUrl);

                    sendEmail();
                    sendInvoiceEmail(response);
                } catch (error) {
                    console.error('Payment success handler error:', error);
                    alert('Error processing payment: ' + error.message);
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', async function (response) {
            // ... (unchanged)
        });
        rzp.open();
    } catch (error) {
        console.error('Payment error:', error);
        showLoading(false);
        alert('Payment initialization failed: ' + error.message);
    }
}

async function saveNoticeToServer() {
    const signatureData = signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL() : null;

    const formData = {
        client: {
            name: document.getElementById('senderName').value,
            address: document.getElementById('senderAddress').value,
            contact: document.getElementById('senderContact').value,
            email: document.getElementById('senderEmail').value
        },
        recipient: {
            name: document.getElementById('recipientName').value,
            address: document.getElementById('recipientAddress').value,
            contact: document.getElementById('recipientContact').value,
            email: document.getElementById('recipientEmail').value
        },
        dispute: {
            relationship: document.getElementById('relationshipType').value,
            transactionDate: document.getElementById('transactionDate').value,
            transactionPlace: document.getElementById('transactionPlace').value,
            contractDetails: document.getElementById('contractDetails').value,
            issueDescription: document.getElementById('issueDescription').value,
            keyEvents: document.getElementById('keyEvents').value,
            damages: document.getElementById('damagesSuffered').value,
            specificDemand: document.getElementById('specificDemand').value,
            compensation: document.getElementById('compensationAmount').value,
            timeframe: document.getElementById('complianceTimeframe').value,
            tone: document.getElementById('tone').value
        },
        signature: signatureData,
        content: legalNoticeDiv.innerHTML || '',
        status: 'pending'
    };

    const response = await fetch('/api/save-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    });

    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Failed to save notice');
    return data.noticeId;
}

function updateUIAfterPayment(success, response = null) {
    const downloadBtn = document.getElementById('downloadBtn');
    const sendBtn = document.getElementById('sendNoticeBtn');
    const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
    const paymentDetailsDiv = document.getElementById('paymentDetails');
    const payNowBtn = document.getElementById('payNowBtn');

    // Enable buttons regardless of payment
    downloadBtn.disabled = false;
    sendBtn.disabled = false;
    shareWhatsappBtn.disabled = false;
    paymentDetailsDiv.innerHTML = '<p>Payment not required</p>';
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Notice';
    if (payNowBtn) payNowBtn.disabled = true;
    showLoading(false);
}

// Generate Legal Notice
async function generateLegalNotice() {
    showLoading(true);
    try {
        const signatureData = signaturePad && !signaturePad.isEmpty() ? signaturePad.toDataURL() : null;
        const formData = {
            client: {
                name: document.getElementById('senderName').value,
                address: document.getElementById('senderAddress').value,
                contact: document.getElementById('senderContact').value,
                email: document.getElementById('senderEmail').value
            },
            recipient: {
                name: document.getElementById('recipientName').value,
                address: document.getElementById('recipientAddress').value,
                contact: document.getElementById('recipientContact').value,
                email: document.getElementById('recipientEmail').value
            },
            dispute: {
                relationship: document.getElementById('relationshipType').value,
                transactionDate: document.getElementById('transactionDate').value,
                transactionPlace: document.getElementById('transactionPlace').value,
                contractDetails: document.getElementById('contractDetails').value,
                issueDescription: document.getElementById('issueDescription').value,
                keyEvents: document.getElementById('keyEvents').value,
                damages: document.getElementById('damagesSuffered').value
            },
            signature: signatureData
        };

        savedSenderName = formData.client.name;
        sessionStorage.setItem('senderName', formData.client.name);

        // Generate notice via OpenAI API
        const response = await fetch(`${BASE_URL}/api/generate-notice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate notice');

        // Process and display notice content with letterhead
        let noticeContent = data.content;
        // Add signature if present
        if (signatureData) {
            noticeContent += `
                <p style="margin-top: 20px;">Signed: This notice is digitally signed by the client, ${formData.client.name}.</p>
                <img src="${signatureData}" style="max-width: 200px; height: auto;" alt="Signature">
            `;
        }

        // Prepend letterhead
        const letterheadDataUrl = await svgToDataUrl(svgLetterhead);
        const finalContent = `
            <img src="${letterheadDataUrl}" style="width: 100%; max-width: 650px; display: block; margin-bottom: 20px;" alt="Letterhead">
            ${noticeContent}
        `;
        legalNoticeDiv.innerHTML = finalContent;

        formContainer.style.display = 'none';
        noticePage.style.display = 'block';

        // Save notice to server
        const noticeId = await saveNoticeToServer();
        currentNoticeId = noticeId;
        window.history.pushState({}, '', `?id=${currentNoticeId}`);

        // Enable buttons after notice generation
        updateUIAfterPayment(true);
    } catch (error) {
        alert(`Error generating notice: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Show form function
function showForm() {
    noticePage.style.display = 'none';
    formContainer.style.display = 'block';
    showStep(1);
}

// PDF Generation
async function generatePDFBlob() {
    if (typeof window.jspdf === 'undefined') throw new Error('jsPDF library not loaded.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // SVG letterhead
    const svgLetterhead = `
    <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="100%" height="100%" fill="#ffffff"/>
      <!-- Border bottom -->
      <line x1="20" y1="190" x2="780" y2="190" stroke="#000000" stroke-width="2"/>
      <!-- Advocate Name -->
      <text x="50%" y="50" font-size="24" font-weight="bold" text-anchor="middle" fill="#000000">
        Adv. Shalini L Tripathi
      </text>
      <!-- Qualification -->
      <text x="50%" y="75" font-size="16" text-anchor="middle" fill="#333333">
        B.Com, LLB
      </text>
      <!-- Contact Details -->
      <text x="50%" y="105" font-size="14" text-anchor="middle" fill="#000000">
        Contact: 9552446231 | Email: info@lexinco.com
      </text>
      <!-- Address -->
      <text x="50%" y="125" font-size="14" text-anchor="middle" fill="#000000">
        204, Poonam Aster, Poonam Nagar, Virar West, Palghar 401303
      </text>
      <!-- License Number -->
      <text x="50%" y="150" font-size="14" text-anchor="middle" fill="#000000">
        License No: MAH/9337/2024
      </text>
    </svg>`;

    // Convert SVG to PNG data URL
    async function svgToDataUrl(svgStr) {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        const img = new Image();
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);

        await new Promise(resolve => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.src = url;
        });

        return canvas.toDataURL('image/png');
    }

    const letterheadDataUrl = await svgToDataUrl(svgLetterhead);

    // Letterhead dimensions in PDF (scaled to fit page width)
    const pageWidth = 210; // A4 width in mm
    const marginLeft = 20;
    const letterheadWidth = pageWidth - 2 * marginLeft; // 190mm
    const letterheadHeight = (200 * letterheadWidth) / 800; // Maintain aspect ratio (47.5mm)
    const contentTopMargin = 10 + letterheadHeight; // 10mm gap below letterhead

    // Render HTML content to PDF with automatic pagination
    await doc.html(legalNoticeDiv, {
        x: marginLeft,
        y: contentTopMargin, // Start content below letterhead
        width: letterheadWidth,
        windowWidth: 650 // Approximate pixel width for scaling
    });

    // Add letterhead and footer to each page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        // Add letterhead at the top
        doc.addImage(
            letterheadDataUrl,
            'PNG',
            marginLeft,
            10, // Top margin
            letterheadWidth,
            letterheadHeight,
            undefined,
            'FAST'
        );
        // Add footer only on the last page
        if (i === pageCount) {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Generated by lexinco.com - Page ${pageCount}`, marginLeft, 287);
        }
    }

    return doc.output('blob');
}


function generatePDF() {
    generatePDFBlob()
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'legal_notice.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF: ' + error.message);
        });
}

async function generateInvoicePDF(paymentResponse) {
    if (typeof window.jspdf === 'undefined') throw new Error('jsPDF library not loaded.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const marginLeft = 20;
    const marginTop = 20;

    doc.setFont("times", "normal");
    doc.setFontSize(16);
    doc.text("Payment Receipt", marginLeft, marginTop);
    doc.setFontSize(12);
    doc.text(`Client: ${document.getElementById('senderName').value}`, marginLeft, marginTop + 10);
    doc.text("Amount: ₹500", marginLeft, marginTop + 20);
    doc.text(`Payment ID: ${paymentResponse.razorpay_payment_id}`, marginLeft, marginTop + 30);
    doc.text(`Order ID: ${paymentResponse.razorpay_order_id}`, marginLeft, marginTop + 40);
    doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, marginLeft, marginTop + 50);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, 267, 190, 267);
    doc.setFontSize(8);
    doc.text("Generated with the help of lexinco.com", marginLeft, 272);

    return doc.output('blob');
}

// Email Functionality
async function sendEmail() {
    let recipientEmail = document.getElementById('recipientEmail').value;
    let senderEmail = document.getElementById('senderEmail').value;

    if (!recipientEmail) {
        recipientEmail = prompt("Enter recipient's email:");
    }
    if (!senderEmail) {
        senderEmail = prompt("Enter your email (from which to send the notice):");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipientEmail || !emailRegex.test(recipientEmail)) {
        alert("Please enter a valid recipient email address.");
        return;
    }
    if (!senderEmail || !emailRegex.test(senderEmail)) {
        alert("Please enter a valid sender email address.");
        return;
    }

    if (!currentNoticeId) {
        alert("Notice ID is missing. Please regenerate the notice.");
        return;
    }

    showLoading(true);
    try {
        // Fetch notice details from server
        const noticeResponse = await fetch(`/api/get-notice/${currentNoticeId}`);
        if (!noticeResponse.ok) {
            throw new Error('Failed to fetch notice details');
        }
        const notice = await noticeResponse.json();
        const senderName = notice.client?.name;
        if (!senderName) {
            throw new Error('Sender name not found in notice data');
        }

        // Generate PDF blob
        const pdfBlob = await generatePDFBlob();
        const pdfFile = new File([pdfBlob], 'legal_notice.pdf', { type: 'application/pdf' });

        // Create FormData to send PDF and metadata
        const formData = new FormData();
        formData.append('pdf', pdfFile);
        formData.append('toEmail', recipientEmail);
        formData.append('fromEmail', senderEmail);
        formData.append('senderName', senderName);

        // Send email with PDF
        const response = await fetch('/api/send-notice', {
            method: 'POST',
            body: formData // FormData handles multipart/form-data automatically
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        if (data.success) {
            alert("Notice sent successfully as a PDF attachment! Please check the recipient's inbox.");
        } else {
            alert("Failed to send notice: " + data.error);
        }
    } catch (error) {
        alert("Error sending notice: " + error.message);
    } finally {
        showLoading(false);
    }
}

function sendInvoiceEmail(paymentResponse) {
    const invoiceContent = `Payment Details:
        Amount: ₹500
        Payment ID: ${paymentResponse.razorpay_payment_id}
        Date: ${new Date().toLocaleDateString('en-GB')}
        Client: ${document.getElementById('senderName').value}`;

    Email.send({
        SecureToken: config.EMAILJS_TOKEN,
        To: document.getElementById('senderEmail').value,
        From: "info@lexinco.com",
        Subject: "Payment Receipt - Lexinco",
        Body: invoiceContent
    }).then(() => {
        console.log('Invoice email sent');
    }).catch(error => {
        console.error('Failed to send invoice email:', error);
    });
}

// Share via WhatsApp
async function shareViaWhatsapp() {
    showLoading(true);
    try {
        const blob = await generatePDFBlob();
        const file = new File([blob], 'legal_notice.pdf', { type: 'application/pdf' });
        const senderName = document.getElementById('senderName').value;
        const message = `Here is the legal notice from ${senderName}. Please review the attached PDF.`;

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                text: message,
                files: [file],
                title: 'Legal Notice'
            });
            console.log('Shared successfully via WhatsApp');
        } else {
            const formData = new FormData();
            formData.append('pdf', blob, 'legal_notice.pdf');

            const uploadResponse = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) throw new Error('Failed to upload PDF to server');

            const uploadData = await uploadResponse.json();
            if (!uploadData.success || !uploadData.url) throw new Error('Invalid response from server');

            const pdfUrl = uploadData.url;
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${message}\nDownload the PDF here: ${pdfUrl}`)}`;
            window.open(whatsappUrl, '_blank');
        }
    } catch (error) {
        console.error('Error sharing via WhatsApp:', error);
        alert('Failed to share via WhatsApp: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Loading State
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Initialize first step
showStep(1);