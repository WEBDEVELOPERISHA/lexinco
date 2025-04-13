const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = isLocal ? 'http://localhost:3000' : '';

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

// Fetch configuration from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
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

            if (notice.payment?.status === 'completed') {
                updateUIAfterPayment(true, {
                    orderId: notice.payment.orderId,
                    paymentId: notice.payment.paymentId
                });
            } else {
                updateUIAfterPayment(false);
            }
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

// Handle Payment and Send
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

// Payment Handling
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
            currency: 'INR', // Change to USD for U.S. testing if using a different gateway
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
            lawsViolated: document.getElementById('lawsViolated').value,
            specificDemand: document.getElementById('specificDemand').value,
            compensation: document.getElementById('compensationAmount').value,
            timeframe: document.getElementById('complianceTimeframe').value,
            country: document.getElementById('country').value,
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

    if (success) {
        paymentDetails = response;
        paymentDetailsDiv.innerHTML = `
            <p>Order ID: ${response.orderId}</p>
            <p>Payment ID: ${response.paymentId}</p>
        `;
        downloadBtn.disabled = false;
        sendBtn.disabled = false;
        shareWhatsappBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-check"></i> Payment Completed';
        if (payNowBtn) payNowBtn.style.display = 'none';
    } else {
        downloadBtn.disabled = true;
        sendBtn.disabled = true;
        shareWhatsappBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-times"></i> Payment Failed - Try Again';
        paymentDetailsDiv.innerHTML = '<p>Payment pending</p>';
        if (payNowBtn) payNowBtn.style.display = 'block';
    }
    showLoading(false);
}

// Generate Legal Notice (moved to server)
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
                damages: document.getElementById('damagesSuffered').value,
                lawsViolated: document.getElementById('lawsViolated').value,
                specificDemand: document.getElementById('specificDemand').value,
                compensation: document.getElementById('compensationAmount').value,
                timeframe: document.getElementById('complianceTimeframe').value,
                country: document.getElementById('country').value,
                tone: document.getElementById('tone').value
            },
            signature: signatureData
        };

        const response = await fetch(`${BASE_URL}/api/generate-notice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate notice');

        const noticeContent = `
            <div class="legal-notice" style="font-family: Times, serif; font-size: 12pt; line-height: 1.5;">
                ${data.content.replace(/\n/g, '<br>')}
                ${formData.signature ? `
                    <div class="esignature" style="margin-top: 30px;">
                        <p><strong>Digitally signed by:</strong></p>
                        <img src="${formData.signature}" alt="Client Signature" style="max-height: 100px; margin-top: 10px;">
                        <p>${formData.client.name}</p>
                    </div>` : ''}
            </div>`;

        legalNoticeDiv.innerHTML = noticeContent;
        formContainer.style.display = 'none';
        noticePage.style.display = 'block';

        const noticeId = await saveNoticeToServer();
        currentNoticeId = noticeId;
        window.history.pushState({}, '', `?id=${currentNoticeId}`);
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

// PDF Generation (Optimized)
async function generatePDFBlob() {
    if (!paymentDetails) throw new Error('Please complete payment first!');
    if (typeof window.jspdf === 'undefined') throw new Error('jsPDF library not loaded.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const marginLeft = 20;
    const marginTop = 20;
    const pageWidth = 210;
    const pageHeight = 297;
    const maxHeightPerPage = pageHeight - marginTop - 30;

    const clonedDiv = legalNoticeDiv.cloneNode(true);
    clonedDiv.style.background = '#ffffff';
    clonedDiv.style.color = '#000000';
    clonedDiv.style.boxShadow = 'none';
    clonedDiv.style.padding = '0';
    clonedDiv.style.margin = '0';
    clonedDiv.style.width = `${pageWidth - 2 * marginLeft}mm`;
    clonedDiv.style.position = 'absolute';
    clonedDiv.style.left = '-9999px';
    document.body.appendChild(clonedDiv);

    const canvas = await html2canvas(clonedDiv, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: false
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.95); // High-quality JPEG
    document.body.removeChild(clonedDiv);

    const imgWidth = pageWidth - 2 * marginLeft;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = marginTop;

    // Add content page by page without repeating
    while (heightLeft > 0) {
        const currentHeight = Math.min(heightLeft, maxHeightPerPage);
        doc.addImage(imgData, 'JPEG', marginLeft, position, imgWidth, imgHeight, undefined, 'FAST');
        doc.setLineWidth(0.5);
        doc.line(marginLeft, pageHeight - 20, pageWidth - marginLeft, pageHeight - 20);
        doc.setFontSize(8);
        doc.text(`Generated by lexinco.com - Page ${doc.internal.getNumberOfPages()}`, marginLeft, pageHeight - 10);

        heightLeft -= maxHeightPerPage;
        if (heightLeft > 0) {
            doc.addPage();
            position = marginTop - (imgHeight - heightLeft);
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
    doc.text("Amount: ₹500", marginLeft, marginTop + 20); // Update to dynamic currency if needed
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
function sendEmail() {
    const noticeContent = legalNoticeDiv.textContent;
    const recipientEmail = document.getElementById('recipientEmail').value || prompt("Enter recipient's email:");

    if (recipientEmail) {
        showLoading(true);
        Email.send({
            SecureToken: config.EMAILJS_TOKEN,
            To: recipientEmail,
            From: "adv.shalinitripathi@example.com",
            Subject: "Legal Notice from " + document.getElementById('senderName').value,
            Body: noticeContent
        }).then(
            () => {
                showLoading(false);
                alert("Notice sent successfully!");
            }
        ).catch(
            error => {
                showLoading(false);
                alert("Failed to send email: " + error.message);
            }
        );
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