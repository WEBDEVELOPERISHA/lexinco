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
                damages: document.getElementById('damagesSuffered').value,
                specificDemand: document.getElementById('specificDemand').value,
                compensation: document.getElementById('compensationAmount').value,
                timeframe: document.getElementById('complianceTimeframe').value,
                country: document.getElementById('country').value,
                tone: document.getElementById('tone').value
            },
            signature: signatureData
        };
        savedSenderName = formData.client.name;
        sessionStorage.setItem('senderName', formData.client.name);

        const response = await fetch(`${BASE_URL}/api/generate-notice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate notice');

        // Sanitize and format the server response
        let noticeContent = data.content
            .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable characters
            .replace(/\n{2,}/g, '\n\n') // Normalize multiple newlines
            .replace(/\n/g, '<br>') // Convert newlines to HTML breaks
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Markdown bold
            .replace(/\*-(.*?)\*\*/g, '<strong>$1</strong>') // Fix incorrect Markdown
            .replace(/\+\+(.*?)\+\+/g, '<strong>$1</strong>') // Fix ++ syntax
            .replace(/"{2,}(.*?)"{2,}/g, '<strong>$1</strong>') // Fix double quotes
            .replace(/\b\d{4}(,\s*\d{4})*\b/g, '') // Remove year sequences
            .replace(/(Timeline of Events\s*){2,}/g, 'Timeline of Events'); // Remove duplicate section titles

        // Ensure proper "To" and "Subject" formatting
        const recipientName = formData.recipient.name.replace(/['"$\\]/g, ''); // Remove problematic characters
        const recipientAddress = formData.recipient.address.replace(/['"$\\]/g, '');
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        noticeContent = `
            To,<br>
            ${recipientName}<br>
            ${recipientAddress}<br>
            <br>
            Subject: <strong>Legal Notice Regarding Breach of Partnership Agreement - Immediate Action Required</strong><br>
            <br>
            Dated: ${currentDate}<br>
            <br>
            ${noticeContent}
        `;

        const finalContent = `
            <div class="legal-notice" style="font-family: Times, serif; font-size: 12pt; line-height: 1.5;">
                ${noticeContent}
                ${formData.signature ? `
                    <div class="esignature" style="margin-top: 30px;">
                        <p><strong>Digitally signed by:</strong></p>
                        <img src="${formData.signature}" alt="Client Signature" style="max-height: 100px; margin-top: 10px;">
                        <p>${formData.client.name}</p>
                    </div>` : ''}
            </div>`;

        legalNoticeDiv.innerHTML = finalContent;
        formContainer.style.display = 'none';
        noticePage.style.display = 'block';

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
    if (typeof html2canvas === 'undefined') throw new Error('html2canvas library not loaded.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const marginLeft = 20;
    const marginTop = 30;
    const pageWidth = 210;
    const pageHeight = 297;
    const footerHeight = 20;
    const maxHeightPerPage = pageHeight - marginTop - footerHeight;

    const clonedDiv = legalNoticeDiv.cloneNode(true);
    clonedDiv.style.position = 'fixed';
    clonedDiv.style.top = '0';
    clonedDiv.style.left = '0';
    clonedDiv.style.width = `${pageWidth - 2 * marginLeft}mm`;
    clonedDiv.style.backgroundColor = '#ffffff';
    clonedDiv.style.padding = '10px';
    clonedDiv.style.zIndex = '-1';
    clonedDiv.style.overflow = 'visible';
    document.body.appendChild(clonedDiv);

    const scale = 3;
    const canvas = await html2canvas(clonedDiv, {
        scale,
        useCORS: true,
        allowTaint: true,
        windowWidth: clonedDiv.scrollWidth,
        windowHeight: clonedDiv.scrollHeight,
        backgroundColor: '#ffffff'
    });
    document.body.removeChild(clonedDiv);

    const imgWidth = pageWidth - 2 * marginLeft;
    const mmPerPx = imgWidth / canvas.width;
    const pageHeightMm = maxHeightPerPage;
    const pageHeightPx = pageHeightMm / mmPerPx;

    let yOffsetPx = 0;
    let heightLeftPx = canvas.height;
    let pageCount = 0;

    while (heightLeftPx > 0) {
        pageCount++;
        const renderHeightPx = Math.min(pageHeightPx, heightLeftPx);
        const renderHeightMm = renderHeightPx * mmPerPx;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = renderHeightPx;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, -yOffsetPx);

        const imgData = tempCanvas.toDataURL('image/jpeg', 0.95);

        doc.addImage(imgData, 'JPEG', marginLeft, marginTop, imgWidth, renderHeightMm, undefined, 'FAST');

        // Footer (line removed, only text retained)
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Generated by lexinco.com - Page ${pageCount}`, marginLeft, pageHeight - 10);

        yOffsetPx += renderHeightPx;
        heightLeftPx -= renderHeightPx;

        if (heightLeftPx > 0) {
            doc.addPage();
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