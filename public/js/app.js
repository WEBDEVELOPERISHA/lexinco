

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
const formContainer = document.querySelector('.generator-container');
const noticePage = document.getElementById('noticePage');
const letterheadBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABQAAAACACAYAAAAa4jRQAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAXEgAAFxIBZ5/SUgAAABl0RVh0Q3JlYXRpb24gVGltZQAwNS8xNy8yNVQxMDozMDo1OVrLB0sAABVpSURBVHic7d1rtF3Vdcfx99/DFgJBEBJSSjVKWkx9SSV9QpRYpS3tQuWTW7b9KQ9xWU5VNIl2U7KdqfMNpZKqSK10EeqVRPpQ8OQjRzJvKXJf7mDMzex29d+ZOdjJlnZsZ6N/cv/M7Zs2ZkZma1O+f//nV9Uu4IABAgQIECBAgAABAwL+AhoUurWFaT74AAAAASUVORK5CYII=';

let currentStep = 0;
let currentNoticeId = null;
let signaturePad = null;
let razorpayKeyId = null;
let stepInteracted = new Array(steps.length).fill(false); // Track interaction per step
let isNextStepProcessing = false; // Debounce flag

const svgLetterhead = `
<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="20" y1="190" x2="780" y2="190" stroke="#000000" stroke-width="2"/>
  <text x="50%" y="50" font-size="24" font-family="Times New Roman, serif" font-weight="bold" text-anchor="middle" fill="#000000">
    Adv. Shalini L Tripathi
  </text>
  <text x="50%" y="75" font-size="16" font-family="Times New Roman, serif" text-anchor="middle" fill="#333333">
    B.Com, LLB
  </text>
  <text x="50%" y="105" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    Contact: 9552446231 | Email: info@lexinco.com
  </text>
  <text x="50%" y="125" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    204, Poonam Aster, Poonam Nagar, Virar West, Palghar 401303
  </text>
  <text x="50%" y="150" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    License No: MAH/9337/aaa
  </text>
</svg>`;

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

function showReviewModal() {
    document.getElementById('reviewModal').style.display = 'block';
}

function closeReviewModal() {
    document.getElementById('reviewModal').style.display = 'none';
}

function startTimer(endTime) {
    const countdownElement = document.getElementById('countdown');
    const interval = setInterval(() => {
        const now = Date.now();
        const remaining = endTime - now;
        if (remaining <= 0) {
            clearInterval(interval);
            document.getElementById('timerDisplay').style.display = 'none';
            document.getElementById('downloadBtn').disabled = false;
            document.getElementById('sendNoticeBtn').disabled = false;
            document.getElementById('shareWhatsappBtn').disabled = false;
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            countdownElement.textContent = `${minutes}m ${seconds}s`;
        }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', async function () {
    await loadConfig();
    initializeSignaturePad();

    // Initialize step interaction tracking
    steps.forEach((step, index) => {
        step.querySelectorAll('input, select, textarea').forEach(input => {
            input.addEventListener('input', () => {
                stepInteracted[index] = true;
                console.log(`Interaction detected on step ${index}, input: ${input.id}`);
            });
        });
    });

    // Progress step navigation
    document.querySelectorAll('.progress-steps .step').forEach((step, index) => {
        step.addEventListener('click', () => {
            if (index <= currentStep || !stepInteracted[currentStep] || validateStep(currentStep)) {
                showStep(index + 1);
            } else {
                validateStep(currentStep);
            }
        });
    });

    // Next button click - Remove existing listeners to prevent duplicates
    const nextButtons = document.querySelectorAll('.next-step');
    nextButtons.forEach(button => {
        button.removeEventListener('click', handleNextClick);
        button.addEventListener('click', handleNextClick);
    });

    function handleNextClick() {
        console.log('Next button clicked for step:', currentStep);
        nextStep();
    }

    const urlParams = new URLSearchParams(window.location.search);
    const noticeId = urlParams.get('id');
    if (noticeId) {
        loadNoticeDetails(noticeId);
    } else {
        showForm();
    }
});

async function loadNoticeDetails(noticeId) {
    try {
        showLoading(true);
        const response = await fetch(`/api/get-notice/${noticeId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const notice = await response.json();

        if (notice && notice.content) {
            legalNoticeDiv.innerHTML = notice.content;
            currentNoticeId = noticeId;
            savedSenderName = notice.client.name;
            formContainer.classList.add('hidden');
            noticePage.classList.add('active');

            const timerDisplay = document.getElementById('timerDisplay');
            if (notice.status === 'pending_send') {
                timerDisplay.style.display = 'block';
                startTimer(new Date(notice.send_at).getTime());
            } else if (notice.status === 'sent') {
                timerDisplay.style.display = 'none';
            }
        } else {
            alert('Notice content not found');
            showForm();
        }
    } catch (error) {
        console.error('Error loading notice:', error);
        alert(`Failed to load notice: ${error.message}`);
        showForm();
    } finally {
        showLoading(false);
    }
}

function showStep(stepIndex) {
    const index = parseInt(stepIndex) - 1;
    console.log('showStep called with stepIndex:', stepIndex, 'index:', index);
    if (index < 0 || index >= steps.length) {
        console.log('Invalid step index, returning');
        return;
    }

    currentStep = index;

    steps.forEach((step, i) => {
        step.classList.toggle('active', i === currentStep);
        step.style.display = i === currentStep ? 'block' : 'none';
        console.log(`Step ${i} display:`, step.style.display);
    });

    progressSteps.forEach((step, i) => {
        step.classList.toggle('active', i <= currentStep);
    });

    window.scrollTo({
        top: form.offsetTop - 100,
        behavior: 'smooth'
    });
}

function nextStep() {
    if (isNextStepProcessing) {
        console.log('nextStep already processing, ignoring call');
        return;
    }
    isNextStepProcessing = true;

    console.log('Current Step Before:', currentStep);
    if (stepInteracted[currentStep] && !validateStep(currentStep)) {
        console.log('Validation failed for step:', currentStep);
        isNextStepProcessing = false;
        return;
    }
    currentStep++;
    console.log('Current Step After:', currentStep);
    if (currentStep >= steps.length) {
        currentStep = steps.length - 1;
        console.log('Clamped currentStep to:', currentStep);
    }
    showStep(currentStep + 1);
    console.log('Showing step:', currentStep + 1);
    if (currentStep === 2) {
        setTimeout(initializeSignaturePad, 100);
    }

    setTimeout(() => {
        isNextStepProcessing = false;
    }, 300);
}

function prevStep() {
    currentStep--;
    if (currentStep < 0) currentStep = 0;
    showStep(currentStep + 1);
}

function validateStep(stepIndex) {
    console.log('Validating step:', stepIndex);
    if (!stepInteracted[stepIndex]) {
        console.log('No interaction, skipping validation for step:', stepIndex);
        return true;
    }

    const currentStepElement = steps[stepIndex];
    const inputs = currentStepElement.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;
    let errorMessages = [];

    const errorContainer = currentStepElement.querySelector('.error-messages');
    if (errorContainer) errorContainer.remove();

    inputs.forEach(input => {
        const value = input.value.trim();
        console.log(`Validating input ${input.id}:`, value);
        if (!value) {
            input.classList.add('error');
            errorMessages.push(`${input.name || input.id} is required.`);
            isValid = false;
        } else {
            if (input.type === 'text' || input.type === 'email') {
                if (value.length > 255) {
                    input.classList.add('error');
                    errorMessages.push(`${input.name || input.id} must be 255 characters or less.`);
                    isValid = false;
                }
            } else if (input.tagName.toLowerCase() === 'textarea') {
                if (value.length > 1000) {
                    input.classList.add('error');
                    errorMessages.push(`${input.name || input.id} must be 1000 characters or less.`);
                    isValid = false;
                }
            }
            input.classList.remove('error');
        }
    });

    if (!isValid && errorMessages.length > 0) {
        console.log('Validation errors:', errorMessages);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-messages';
        errorDiv.style.color = 'red';
        errorDiv.style.marginTop = '10px';
        errorDiv.innerHTML = errorMessages.map(msg => `<p>${msg}</p>`).join('');
        currentStepElement.appendChild(errorDiv);
    }
    return isValid;
}

function clearSignature() {
    if (signaturePad) signaturePad.clear();
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateStep(currentStep)) return;
    if (!signaturePad || signaturePad.isEmpty()) {
        alert('Please provide your signature.');
        return;
    }
    if (!document.getElementById('confirmDetails').checked || !document.getElementById('privacyPolicy').checked) {
        alert('Please confirm the details and agree to the privacy policy.');
        return;
    }
    await generateLegalNotice();
});

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
                issueDescription: document.getElementById('issueDescription').value,
                keyEvents: document.getElementById('keyEvents').value,
                damages: document.getElementById('damagesSuffered').value,
                tone: document.getElementById('tone').value
            }
        };

        const response = await fetch('/api/generate-notice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await response.json();
        if (!data.content) throw new Error(data.error || 'Failed to generate notice');

        const noticeContent = DOMPurify.sanitize(data.content);
        legalNoticeDiv.innerHTML = noticeContent;
        formData.signature = signatureData;
        formData.content = noticeContent;

        const pdfBlob = await generatePDFBlob(noticeContent);
        const pdfFormData = new FormData();
        pdfFormData.append('pdf', pdfBlob, 'legal_notice.pdf');
        pdfFormData.append('client', JSON.stringify(formData.client));
        pdfFormData.append('recipient', JSON.stringify(formData.recipient));
        pdfFormData.append('dispute', JSON.stringify(formData.dispute));
        pdfFormData.append('signature', signatureData);
        pdfFormData.append('content', noticeContent);

        const saveResponse = await fetch('/api/save-notice', {
            method: 'POST',
            body: pdfFormData
        });
        const saveData = await saveResponse.json();
        if (!saveData.success) throw new Error(saveData.details || saveData.error || 'Failed to save notice');

        currentNoticeId = saveData.noticeId;
        localStorage.setItem('lastNoticeId', currentNoticeId);
        window.history.pushState({}, '', `?id=${currentNoticeId}`);

        showReviewModal();

        setTimeout(async () => {
            try {
                const sendResponse = await fetch(`/api/send-notice/${currentNoticeId}`, { method: 'POST' });
                const sendData = await sendResponse.json();
                if (sendData.success) {
                    alert('Notice has been sent to your inbox');
                    loadNoticeDetails(currentNoticeId);
                } else {
                    throw new Error(sendData.error || 'Failed to send notice');
                }
            } catch (error) {
                console.error('Error sending notice:', error);
                alert(`Failed to send notice: ${error.message}`);
            }
        }, 30 * 60 * 1000);

        formContainer.classList.add('hidden');
        noticePage.classList.add('active');
    } catch (error) {
        console.error('Error generating notice:', error);
        alert(`Error generating notice: ${error.message}\nDetails: ${error.response?.data?.details || 'No details available'}`);
    } finally {
        showLoading(false);
    }
}

async function initiatePayment() {
    try {
        showLoading(true);
        const orderResponse = await fetch(`${BASE_URL}/api/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noticeId: currentNoticeId })
        });

        if (!orderResponse.ok) {
            const error = await orderResponse.json();
            throw new Error(error.details || error.error || 'Failed to create payment order');
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
                    const updateResponse = await fetch(`${BASE_URL}/api/update-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            noticeId: currentNoticeId,
                            status: 'completed',
                            paymentId: response.razorpay_payment_id,
                            orderId: response.razorpay_order_id
                        })
                    });

                    if (!updateResponse.ok) throw new Error('Failed to update payment status');

                    localStorage.setItem('lastNoticeId', currentNoticeId);
                    showReviewModal();
                    loadNoticeDetails(currentNoticeId);
                } catch (error) {
                    console.error('Payment success handler error:', error);
                    alert(`Error processing payment: ${error.message}`);
                } finally {
                    showLoading(false);
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            alert(`Payment failed: ${response.error.description}`);
            showLoading(false);
        });
        rzp.open();
    } catch (error) {
        console.error('Payment error:', error);
        alert(`Payment initialization failed: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function getLawyerSignatureBase64(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg');
            resolve(base64);
        };

        img.onerror = () => reject(new Error(`Could not load image: ${imageUrl}`));
    });
}

async function generatePDFBlob(noticeContent) {
    if (typeof window.jspdf === 'undefined') throw new Error('jsPDF library not loaded.');
    if (typeof html2canvas === 'undefined') throw new Error('html2canvas library not loaded.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const marginLeft = 20;
    const marginTop = 30;
    const pageWidth = 210;
    const pageHeight = 297;
    const footerHeight = 20;
    const headerHeight = 50;
    const maxHeightPerPage = pageHeight - marginTop - footerHeight - headerHeight;

    const svgString = `
      <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <line x1="20" y1="190" x2="780" y2="190" stroke="#000000" stroke-width="2"/>
        <text x="50%" y="50" font-size="24" font-weight="bold" text-anchor="middle" fill="#000000">Adv. Shalini L Tripathi</text>
        <text x="50%" y="75" font-size="16" text-anchor="middle" fill="#333333">B.Com, LLB</text>
        <text x="50%" y="105" font-size="14" text-anchor="middle" fill="#000000">Contact: 9552446231 | Email: info@lexinco.com</text>
        <text x="50%" y="125" font-size="14" text-anchor="middle" fill="#000000">204, Poonam Aster, Poonam Nagar, Virar West, Palghar 401303</text>
        <text x="50%" y="150" font-size="14" text-anchor="middle" fill="#000000">License No: MAH/9337/aaa</text>
      </svg>
    `;
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.src = svgUrl;
    await new Promise((resolve) => { img.onload = resolve; });

    const canvasHeader = document.createElement('canvas');
    canvasHeader.width = img.width;
    canvasHeader.height = img.height;
    const ctxHeader = canvasHeader.getContext('2d');
    ctxHeader.fillStyle = '#ffffff';
    ctxHeader.fillRect(0, 0, canvasHeader.width, canvasHeader.height);
    ctxHeader.drawImage(img, 0, 0);
    const letterheadBase64 = canvasHeader.toDataURL('image/png');
    URL.revokeObjectURL(svgUrl);

    const lawyerSignatureBase64 = await getLawyerSignatureBase64('/signature (2).jpeg');

    const clonedDiv = document.createElement('div');
    clonedDiv.innerHTML = noticeContent;
    clonedDiv.style.position = 'fixed';
    clonedDiv.style.top = '0';
    clonedDiv.style.left = '0';
    clonedDiv.style.width = `${pageWidth - 2 * marginLeft}mm`;
    clonedDiv.style.backgroundColor = '#ffffff';
    clonedDiv.style.padding = '10px';
    clonedDiv.style.zIndex = '-1';
    clonedDiv.style.overflow = 'visible';
    clonedDiv.style.fontFamily = 'Times New Roman, Times, serif';
    clonedDiv.style.fontSize = '12pt';
    clonedDiv.style.lineHeight = '1.5';
    clonedDiv.style.color = '#000';
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
    const pageHeightPx = maxHeightPerPage / mmPerPx;

    let yOffsetPx = 0;
    let pageCount = 0;
    const overlap = 15;
    const totalHeight = canvas.height;

    while (yOffsetPx < totalHeight) {
        pageCount++;
        const isFirstPage = pageCount === 1;
        const isLastPage = (totalHeight - yOffsetPx) <= pageHeightPx;

        let renderHeightPx = Math.min(pageHeightPx, totalHeight - yOffsetPx);
        if (isLastPage) renderHeightPx = totalHeight - yOffsetPx;

        const renderHeightMm = renderHeightPx * mmPerPx;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = renderHeightPx + (pageCount > 1 && !isLastPage ? overlap : 0);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, -(yOffsetPx - (pageCount > 1 && !isLastPage ? overlap : 0)));

        const imgData = tempCanvas.toDataURL('image/jpeg', 0.95);

        if (isFirstPage) {
            const letterheadHeight = 40;
            doc.addImage(letterheadBase64, 'PNG', marginLeft, 10, imgWidth, letterheadHeight);
        }

        const contentTopOffset = isFirstPage ? 10 + headerHeight + 5 : marginTop;
        doc.addImage(imgData, 'JPEG', marginLeft, contentTopOffset, imgWidth, renderHeightMm, undefined, 'FAST');

        const footerText = `Generated by `;
        const websiteText = `lexinco.com`;
        const pageText = ` - Page ${pageCount}`;

        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(footerText, marginLeft, pageHeight - 10);

        const linkX = marginLeft + doc.getTextWidth(footerText);
        doc.setTextColor(0, 0, 255);
        doc.textWithLink(websiteText, linkX, pageHeight - 10, { url: 'https://lexinco.com' });

        const pageX = linkX + doc.getTextWidth(websiteText);
        doc.setTextColor(150);
        doc.text(pageText, pageX, pageHeight - 10);

        yOffsetPx += renderHeightPx;
        if (yOffsetPx < totalHeight) {
            doc.addPage();
        }
    }

    const signatureWidth = 40;
    const signatureHeight = 15;
    const signatureX = pageWidth - marginLeft - signatureWidth;
    const signatureY = pageHeight - 50;

    doc.addImage(lawyerSignatureBase64, 'JPEG', signatureX, signatureY, signatureWidth, signatureHeight);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Adv. Shalini L Tripathi", signatureX, signatureY + signatureHeight + 6);

    return doc.output('blob');
}

function generatePDF() {
    generatePDFBlob(legalNoticeDiv.innerHTML)
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
            alert(`Failed to generate PDF: ${error.message}`);
        });
}

async function sendEmail() {
    let senderEmail = document.getElementById('senderEmail').value;

    if (!senderEmail) {
        senderEmail = prompt("Please enter your email address:");
        if (!senderEmail) {
            alert('Your email is required.');
            return;
        }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(senderEmail)) {
        alert('Please enter a valid email address.');
        return;
    }

    if (!currentNoticeId) {
        alert('Notice ID is missing. Please regenerate the notice.');
        return;
    }

    showLoading(true);
    try {
        const pdfBlob = await generatePDFBlob(legalNoticeDiv.innerHTML);
        const pdfFile = new File([pdfBlob], 'legal_notice.pdf', { type: 'application/pdf' });

        const formData = new FormData();
        formData.append('pdf', pdfFile);
        formData.append('fromEmail', senderEmail);
        formData.append('senderName', savedSenderName);

        const response = await fetch('/api/send-notice', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            alert('Notice sent successfully as a PDF attachment to your inbox!');
        } else {
            throw new Error(data.error || 'Failed to send notice');
        }
    } catch (error) {
        console.error('Error sending notice:', error);
        alert(`Error sending notice: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function shareViaWhatsapp() {
    showLoading(true);
    try {
        const blob = await generatePDFBlob(legalNoticeDiv.innerHTML);
        const file = new File([blob], 'legal_notice.pdf', { type: 'application/pdf' });
        const message = `Legal notice from ${savedSenderName}. Please review the attached PDF.`;

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                text: message,
                files: [file],
                title: 'Legal Notice'
            });
        } else {
            const formData = new FormData();
            formData.append('pdf', blob, 'legal_notice.pdf');

            const uploadResponse = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData
            });

            const uploadData = await uploadResponse.json();
            if (!uploadData.success) throw new Error(uploadData.error || 'Failed to upload PDF');

            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${message}\nDownload the PDF here: ${uploadData.url}`)}`;
            window.open(whatsappUrl, '_blank');
        }
    } catch (error) {
        console.error('Error sharing via WhatsApp:', error);
        alert(`Failed to share via WhatsApp: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function showForm() {
    noticePage.classList.remove('active');
    formContainer.classList.remove('hidden');
    showStep(1);
}

function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

showStep(1);