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
const letterheadBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABQAAAACACAYAAAAa4jRQAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAXEgAAFxIBZ5/SUgAAABl0RVh0Q3JlYXRpb24gVGltZQAwNS8xNy8yNVQxMDozMDo1OVrLB0sAABVpSURBVHic7d1rtF3Vdcfx99/DFgJBEBJSSjVKWkx9SSV9QpRYpS3tQuWTW7b9KQ9xWU5VNIl2U7KdqfMNpZKqSK10EeqVRPpQ8OQjRzJvKXJf7mDMzex29d+ZOdjJlnZsZ6N/cv/M7Zs2ZkZma1O+f//nV9Uu4IABAgQIECBAgAABAwL+AhoUurWFaT74AAAAASUVORK5CYII=';



let currentStep = 0;
let currentNoticeId = null;
let signaturePad = null;
let razorpayKeyId = null;

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
    await loadConfig();
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
            nextStep();
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
                tone: document.getElementById('tone').value
            },
            signature: signatureData
        };
        savedSenderName = formData.client.name;
        sessionStorage.setItem('senderName', formData.client.name);

        // Construct notice content with proper formatting
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const noticeContent = `
            <div class="legal-notice" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #000;">
                <div style="margin-bottom: 20px;">
                    To,<br>
                    ${formData.recipient.name}<br>
                    ${formData.recipient.address}<br>
                </div>
                <div style="margin-bottom: 20px;">
                    Subject: <strong>Legal Notice Regarding Breach of Consumer Agreement</strong><br>
                </div>
                <div style="margin-bottom: 20px;">
                    Dated: ${currentDate}<br>
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>1. Introduction and Identification of Parties</strong><br>
                    I, Adv. Shalini L Tripathi, legal representative of ${formData.client.name}, ${formData.client.address}, hereby issue this notice to ${formData.recipient.name}, situated at ${formData.recipient.address}. This notice addresses a serious consumer-business dispute arising from your company's breach of contractual obligations.
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>2. Detailed Background and Factual Matrix</strong><br>
                    On ${formData.dispute.transactionDate}, my client engaged in a transaction with your company for ${formData.dispute.contractDetails}. The terms stipulated delivery within ${formData.dispute.timeframe} and a product free of defects. However, ${formData.dispute.issueDescription}.
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>3. Timeline of Events</strong><br>
                    ${formData.dispute.keyEvents.replace(/\n/g, '<br>')}<br>
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>4. Legal Violations & Statutory References</strong><br>
                    Your company's actions constitute a breach of contract under the Indian Contract Act, 1872. Additionally, your failure to address my client's complaints violates the Consumer Protection Act, 2019, specifically regarding the right to a refund or replacement for defective goods.
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>5. Damages and Hardships Faced</strong><br>
                    Due to your negligence, my client has suffered damages amounting to ₹${formData.dispute.compensation}. The mental distress and inconvenience caused by your unresponsiveness further aggravate the hardship faced by my client.
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>6. Legal Consequences of Non-Compliance</strong><br>
                    Failure to comply with the demands herein within ${formData.dispute.timeframe} will compel my client to initiate legal proceedings, including filing a complaint with the Consumer Court, seeking compensation for damages suffered.
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>7. Demand for Relief and Compliance Timeframe</strong><br>
                    My client demands ${formData.dispute.specificDemand} within ${formData.dispute.timeframe} from the date of receipt of this notice. Additionally, compensation of ₹${formData.dispute.compensation} is sought for the distress and inconvenience caused.
                </div>
                <div style="margin-bottom: 20px;">
                    <strong>8. Conclusion and Final Intimation</strong><br>
                    This notice serves as a final intimation to rectify the breach within the stipulated timeframe. Failure to comply will result in legal action without further notice.
                </div>
                <div style="margin-top: 30px;">
                    From,<br>
                    ${formData.client.name}<br>
                    ${formData.client.address}<br>
                </div>
                ${formData.signature ? `
                    <div class="esignature" style="margin-top: 30px;">
                        <p><strong>Digitally signed by:</strong></p>
                        <img src="${formData.signature}" alt="Client Signature" style="max-height: 100px; margin-top: 10px;">
                        <p>${formData.client.name}</p>
                    </div>` : ''}
            </div>
        `;

        legalNoticeDiv.innerHTML = noticeContent;
        formContainer.style.display = 'none';
        noticePage.style.display = 'block';

        const noticeId = await saveNoticeToServer(formData, noticeContent);
        currentNoticeId = noticeId;
        window.history.pushState({}, '', `?id=${currentNoticeId}`);

        updateUIAfterPayment(true);
    } catch (error) {
        alert(`Error generating notice: ${error.message}`);
        console.error('Error:', error);
    } finally {
        showLoading(false);
    }
}

// Save notice to server
async function saveNoticeToServer(formData, content) {
    const response = await fetch('/api/save-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, content, status: 'pending' })
    });

    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Failed to save notice');
    return data.noticeId;
}

// Update UI after payment
function updateUIAfterPayment(success) {
    const downloadBtn = document.getElementById('downloadBtn');
    const sendBtn = document.getElementById('sendNoticeBtn');
    const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
    const paymentDetailsDiv = document.getElementById('paymentDetails');
    const payNowBtn = document.getElementById('payNowBtn');

    downloadBtn.disabled = false;
    sendBtn.disabled = false;
    shareWhatsappBtn.disabled = false;
    paymentDetailsDiv.innerHTML = '<p>Payment not required</p>';
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Notice';
    if (payNowBtn) payNowBtn.disabled = true;
    showLoading(false);
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
    const headerHeight = 50;
    const maxHeightPerPage = pageHeight - marginTop - footerHeight - headerHeight;

    // STEP 1: Convert SVG to base64 PNG using canvas
    const svgString = `
      <svg width="800" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <line x1="20" y1="190" x2="780" y2="190" stroke="#000000" stroke-width="2"/>
        <text x="50%" y="50" font-size="24" font-weight="bold" text-anchor="middle" fill="#000000">Adv. Shalini L Tripathi</text>
        <text x="50%" y="75" font-size="16" text-anchor="middle" fill="#333333">B.Com, LLB</text>
        <text x="50%" y="105" font-size="14" text-anchor="middle" fill="#000000">Contact: 9552446231 | Email: info@lexinco.com</text>
        <text x="50%" y="125" font-size="14" text-anchor="middle" fill="#000000">204, Poonam Aster, Poonam Nagar, Virar West, Palghar 401303</text>
        <text x="50%" y="150" font-size="14" text-anchor="middle" fill="#000000">License No: MAH/9337/2024</text>
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

    // STEP 2: Capture the legal notice content
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
    const pageHeightPx = maxHeightPerPage / mmPerPx;

    let yOffsetPx = 0;
    let heightLeftPx = canvas.height;
    let pageCount = 0;
    const overlap = 15;

    while (yOffsetPx < canvas.height) {
        pageCount++;

        const isFirstPage = pageCount === 1;

        const renderHeightPx = Math.min(pageHeightPx, canvas.height - yOffsetPx);
        const renderHeightMm = renderHeightPx * mmPerPx;

        // Create temp canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = renderHeightPx + 10; // Extra padding

        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        tempCtx.drawImage(canvas, 0, -yOffsetPx);

        const imgData = tempCanvas.toDataURL('image/jpeg', 1.0);

        // Letterhead (first page)
        const letterheadHeight = 40;
        if (isFirstPage) {
            doc.addImage(letterheadBase64, 'PNG', marginLeft, 10, imgWidth, letterheadHeight);
        }

        const contentTopOffset = isFirstPage ? 10 + letterheadHeight + 5 : marginTop;

        doc.addImage(
            imgData,
            'JPEG',
            marginLeft,
            contentTopOffset,
            imgWidth,
            renderHeightMm,
            undefined,
            'FAST'
        );

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Generated by lexinco.com - Page ${pageCount}`, marginLeft, pageHeight - 10);

        yOffsetPx += renderHeightPx;

        if (yOffsetPx < canvas.height) {
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

// Email Functionality
async function sendEmail() {
    let recipientEmail = document.getElementById('recipientEmail').value;
    let senderEmail = document.getElementById('senderEmail').value;

    if (!recipientEmail || !senderEmail) {
        alert('Recipient and sender email addresses are required.');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
        alert('Please enter a valid recipient email address.');
        return;
    }
    if (!emailRegex.test(senderEmail)) {
        alert('Please enter a valid sender email address.');
        return;
    }

    if (!currentNoticeId) {
        alert('Notice ID is missing. Please regenerate the notice.');
        return;
    }

    showLoading(true);
    try {
        const pdfBlob = await generatePDFBlob();
        const pdfFile = new File([pdfBlob], 'legal_notice.pdf', { type: 'application/pdf' });

        const formData = new FormData();
        formData.append('pdf', pdfFile);
        formData.append('toEmail', recipientEmail);
        formData.append('fromEmail', senderEmail);
        formData.append('senderName', savedSenderName);

        const response = await fetch('/api/send-notice', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            alert('Notice sent successfully as a PDF attachment!');
        } else {
            alert('Failed to send notice: ' + data.error);
        }
    } catch (error) {
        alert('Error sending notice: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Share via WhatsApp
async function shareViaWhatsapp() {
    showLoading(true);
    try {
        const blob = await generatePDFBlob();
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
            if (!uploadData.success || !uploadData.url) throw new Error('Invalid response from server');

            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${message}\nDownload the PDF here: ${uploadData.url}`)}`;
            window.open(whatsappUrl, '_blank');
        }
    } catch (error) {
        console.error('Error sharing via WhatsApp:', error);
        alert('Failed to share via WhatsApp: ' + error.message);
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

// Loading State
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Initialize first step
showStep(1);