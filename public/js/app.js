const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = isLocal ? 'http://localhost:3000' : '';
let savedSenderName = '';

const config = {};
const form = document.getElementById('noticeForm');
const steps = document.querySelectorAll('.form-step');
const signaturePadCanvas = document.getElementById('signature-pad');
const loadingOverlay = document.getElementById('loadingOverlay');
const legalNoticeDiv = document.getElementById('legalNotice');
const formContainer = document.querySelector('.generator-container');
const noticePage = document.getElementById('noticePage');
const letterheadBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABQAAAACACAYAAAAa4jRQAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAXEgAAFxIBZ5/SUgAAABl0RVh0Q3JlYXRpb24gVGltZQAwNS8xNy8yNVQxMDozMDo1OVrLB0sAABVpSURBVHic7d1rtF3Vdcfx99/DFgJBEBJSSjVKWkx9SSV9QpRYpS3tQuWTW7b9KQ9xWU5VNIl2U7KdqfMNpZKqSK10EeqVRPpQ8OQjRzJvKXJf7mDMzex29d+ZOdjJlnZsZ6N/cv/M7Zs2ZkZma1O+f//nV9Uu4IABAgQIECBAgAABAwL+AhoUurWFaT74AAAAASUVORK5CYII=';

let currentStep = 0;
let currentNoticeId = null;
let signaturePad = null;
let stepInteracted = new Array(steps.length).fill(false);
let isNextStepProcessing = false;

const svgLetterhead = `
<svg width="800" height="220" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="20" y1="210" x2="780" y2="210" stroke="#000000" stroke-width="2"/>
  
  <text x="50%" y="50" font-size="24" font-family="Times New Roman, serif" font-weight="bold" text-anchor="middle" fill="#000000">
    Adv. Shalini L Tripathi
  </text>
  <text x="50%" y="75" font-size="16" font-family="Times New Roman, serif" text-anchor="middle" fill="#333333">
    B.Com, LLB
  </text>
  <text x="50%" y="105" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    Contact: 9552446231 | Email: adv.shalinitripathi@gmail.com
  </text>
  <text x="50%" y="130" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    03, 1st Floor, Navkar Paradise Building, Bihind Vimal Interior Hub
  </text>
  <text x="50%" y="150" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    Near Laxmi Chaya Building, Babhai Naka, Lt. Loait, Borivali(W), Mumbai 400092
  </text>
  <text x="50%" y="175" font-size="14" font-family="Times New Roman, serif" text-anchor="middle" fill="#000000">
    License No: MAH/9337/2024
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
        await response.json();
    } catch (error) {
        // console.error('Error loading config:', error);
        alert('Failed to load configuration. Please refresh the page.');
    }
}

function initializeSignaturePad() {
    if (!signaturePadCanvas) {
        // console.error('Signature pad canvas not found');
        return;
    }

    // Ensure canvas is visible and has proper dimensions
    signaturePadCanvas.style.display = 'block';
    signaturePadCanvas.style.backgroundColor = '#ffffff';

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    signaturePadCanvas.width = signaturePadCanvas.offsetWidth * ratio;
    signaturePadCanvas.height = signaturePadCanvas.offsetHeight * ratio;
    const ctx = signaturePadCanvas.getContext('2d');
    ctx.scale(ratio, ratio);

    // Initialize SignaturePad
    try {
        signaturePad = new SignaturePad(signaturePadCanvas, {
            backgroundColor: 'rgb(255, 255, 255)',
            penColor: 'rgb(0, 0, 0)',
            minWidth: 1,
            maxWidth: 2.5,
            throttle: 16
        });
        // console.log('SignaturePad initialized. Canvas dimensions:', signaturePadCanvas.width, signaturePadCanvas.height);

        // Clear the canvas to ensure a clean state
        signaturePad.clear();

        // Add event listeners for debugging
        signaturePad.addEventListener('beginStroke', () => {
            // console.log('Drawing started');
        });
        signaturePad.addEventListener('endStroke', () => {
            // console.log('Drawing ended. Signature data:', signaturePad.toData());
        });
    } catch (error) {
        // console.error('Failed to initialize SignaturePad:', error);
        alert('Failed to initialize signature pad. Please try again.');
    }

    // Handle window resize
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

document.addEventListener('DOMContentLoaded', async function () {
    await loadConfig();
    initializeSignaturePad();

    steps.forEach((step, index) => {
        step.querySelectorAll('input, select, textarea').forEach(input => {
            input.addEventListener('input', () => {
                stepInteracted[index] = true;
                // console.log(`Interaction detected on step ${index}, input: ${input.id}`);
            });
        });
    });

    const nextButtons = document.querySelectorAll('.next-step');
    nextButtons.forEach(button => {
        button.removeEventListener('click', handleNextClick);
        button.addEventListener('click', handleNextClick);
    });

    function handleNextClick() {
        // console.log('Next button clicked for step:', currentStep);
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
            // console.log('Loading notice:', noticeId, 'status:', notice.status);
            currentNoticeId = noticeId;
            savedSenderName = notice.client.name;
            formContainer.classList.add('hidden');
            noticePage.classList.add('active');

            const paymentDetails = document.getElementById('paymentDetails');
            const legalNotice = document.getElementById('legalNotice');
            const timerDisplay = document.getElementById('timerDisplay');
            const statusMessage = document.getElementById('noticeStatusMessage');

            if (notice.status === 'generated') {
                statusMessage.innerHTML = '<i class="fas fa-check-circle"></i> Your legal notice has been generated and sent to our advocate for review. We will contact you shortly for further steps.';
                paymentDetails.innerHTML = '';
                legalNotice.innerHTML = notice.content;
                timerDisplay.style.display = 'none';
            } else {
                throw new Error(`Invalid notice status: ${notice.status}`);
            }
        } else {
            // console.error('Notice not found or invalid for noticeId:', noticeId);
            alert('Notice not found. Please generate a new notice.');
            showForm();
        }
    } catch (error) {
        // console.error('Error loading notice:', error);
        alert(`Failed to load notice: ${error.message}`);
        showForm();
    } finally {
        showLoading(false);
    }
}

function showStep(stepIndex) {
    const index = parseInt(stepIndex) - 1;
    // console.log('showStep called with stepIndex:', stepIndex, 'index:', index);

    if (index < 0 || index >= steps.length) {
        // console.error('Invalid step index:', index);
        isNextStepProcessing = false;
        return;
    }

    currentStep = index;

    // Update step visibility
    steps.forEach((step, i) => {
        const isActive = i === currentStep;
        step.classList.toggle('active', isActive);
        step.style.display = isActive ? 'block' : 'none';
        // console.log(`Step ${i + 1} display:`, step.style.display);
    });

    // Update progress bar and step title
    const stepNumber = currentStep + 1;
    document.getElementById('currentStep').textContent = stepNumber;
    document.getElementById('stepTitle').textContent = steps[currentStep].dataset.title;
    const percentage = (stepNumber / steps.length) * 100;
    document.getElementById('progressFill').style.width = `${percentage}%`;

    // Re-initialize signature pad for step 6
    if (stepNumber === 6) {
        // console.log('Re-initializing signature pad for Step 6');
        initializeSignaturePad();
    }

    // Smooth scroll to the form
    window.scrollTo({
        top: form.offsetTop - 100,
        behavior: 'smooth'
    });
}

function nextStep() {
    // console.log('nextStep called. Current step:', currentStep, 'isNextStepProcessing:', isNextStepProcessing);

    if (isNextStepProcessing) {
        // console.log('nextStep is already processing, ignoring call');
        return;
    }

    isNextStepProcessing = true;

    // Validate the current step if it has been interacted with
    if (stepInteracted[currentStep] && !validateStep(currentStep)) {
        // console.log('Validation failed for step:', currentStep);
        isNextStepProcessing = false;
        return;
    }

    // Increment step and ensure it stays within bounds
    currentStep = Math.min(currentStep + 1, steps.length - 1);
    // console.log('Moving to step:', currentStep + 1);

    // Show the new step
    showStep(currentStep + 1);

    // Reset the processing flag
    setTimeout(() => {
        isNextStepProcessing = false;
        // console.log('isNextStepProcessing reset to false');
    }, 300);
}

function prevStep() {
    // console.log('prevStep called. Current step:', currentStep);

    // Decrement step and ensure it stays within bounds
    currentStep = Math.max(currentStep - 1, 0);
    // console.log('Moving to step:', currentStep + 1);

    // Show the new step
    showStep(currentStep + 1);

    // Ensure isNextStepProcessing is reset when going back
    isNextStepProcessing = false;
    // console.log('isNextStepProcessing reset to false (prevStep)');
}

function validateStep(stepIndex) {
    // console.log('Validating step:', stepIndex);
    if (!stepInteracted[stepIndex]) {
        // console.log('No interaction, skipping validation for step:', stepIndex);
        return true;
    }

    const stepElement = steps[stepIndex];
    const requiredInputs = stepElement.querySelectorAll('input[required], textarea[required], select[required]');
    let isValid = true;

    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.classList.add('error');
        } else {
            input.classList.remove('error');
        }
    });

    if (stepIndex === 5) {
        if (signaturePad.isEmpty()) {
            alert('Please provide your signature.');
            isValid = false;
        }
        const confirmDetails = document.getElementById('confirmDetails').checked;
        const privacyPolicy = document.getElementById('privacyPolicy').checked;
        if (!confirmDetails || !privacyPolicy) {
            alert('Please confirm the details and agree to the privacy policy.');
            isValid = false;
        }
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
    // console.log('Starting generateLegalNotice');
    showLoading(true);
    try {
        if (!signaturePad || signaturePad.isEmpty()) {
            alert('Please provide your signature.');
            return;
        }
        if (!document.getElementById('confirmDetails').checked || !document.getElementById('privacyPolicy').checked) {
            alert('Please confirm the details and agree to the privacy policy.');
            return;
        }

        const signatureData = signaturePad.toDataURL();
        // console.log('Signature data captured:', signatureData.substring(0, 50) + '...');

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
                contact: document.getElementById('recipientContact').value || '',
                email: document.getElementById('recipientEmail').value || ''
            },
            dispute: {
                issueDescription: document.getElementById('issueDescription').value,
                damages: document.getElementById('damagesSuffered').value,
                relationship: '',
                keyEvents: '',
                tone: ''
            }
        };
        // console.log('Form data prepared:', formData);

        // console.log('Fetching notice from /api/generate-notice');
        const response = await fetch('/api/generate-notice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await response.json();
        if (!data.content) {
            throw new Error(data.error || 'Failed to generate notice');
        }
        // console.log('Notice content received:', data.content.substring(0, 100) + '...');

        const noticeContent = DOMPurify.sanitize(data.content);
        // console.log('Notice content sanitized');

        // console.log('Generating PDF blob');
        const pdfBlob = await generatePDFBlob(noticeContent);
        // console.log('PDF blob generated');

        const pdfFormData = new FormData();
        pdfFormData.append('pdf', pdfBlob, 'legal_notice.pdf');
        pdfFormData.append('client', JSON.stringify(formData.client));
        pdfFormData.append('recipient', JSON.stringify(formData.recipient));
        pdfFormData.append('dispute', JSON.stringify(formData.dispute));
        pdfFormData.append('signature', signatureData);
        pdfFormData.append('content', noticeContent);
        // console.log('PDF form data prepared');

        // console.log('Saving notice to /api/save-notice');
        const saveResponse = await fetch('/api/save-notice', {
            method: 'POST',
            body: pdfFormData
        });
        const saveData = await saveResponse.json();
        if (!saveData.success) {
            throw new Error(saveData.details || saveData.error || 'Failed to save notice');
        }
        // console.log('Notice saved, noticeId:', saveData.noticeId);

        currentNoticeId = saveData.noticeId;
        localStorage.setItem('lastNoticeId', currentNoticeId);
        window.history.pushState({}, '', `?id=${currentNoticeId}`);
        // console.log('Notice ID set and URL updated:', currentNoticeId);

        // console.log('Loading notice details');
        await loadNoticeDetails(currentNoticeId);
        // console.log('Notice details loaded');
    } catch (error) {
        // console.error('Error in generateLegalNotice:', error);
        alert(`Error generating notice: ${error.message}`);
    } finally {
        // console.log('Hiding loading overlay');
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
    // console.log('Starting generatePDFBlob');
    // console.log('Notice content length:', noticeContent.length);
    // console.log('Notice content preview:', noticeContent.substring(0, 500));

    // Initialize jsPDF with A4 portrait settings
    const doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 15;
    const marginTop = 15;
    const mmPerPx = 0.264583333; // 96 DPI / 25.4 mm per inch
    const pageHeightPx = pageHeight / mmPerPx;

    // Create and style temporary div for rendering
    // console.log('Creating temporary div for notice content');
    const clonedDiv = document.createElement('div');
    clonedDiv.innerHTML = noticeContent;
    clonedDiv.style.position = 'fixed';
    clonedDiv.style.top = '0';
    clonedDiv.style.left = '0';
    clonedDiv.style.width = `${pageWidth - 2 * marginLeft}mm`;
    clonedDiv.style.maxHeight = '10000px'; // Cap height to prevent excessive rendering
    clonedDiv.style.backgroundColor = '#ffffff';
    clonedDiv.style.padding = '10px';
    clonedDiv.style.zIndex = '-1';
    clonedDiv.style.overflow = 'hidden'; // Prevent content overflow
    clonedDiv.style.fontFamily = 'Times New Roman, Times, serif';
    clonedDiv.style.fontSize = '12pt';
    clonedDiv.style.lineHeight = '1.5';
    clonedDiv.style.color = '#000';
    document.body.appendChild(clonedDiv);
    // console.log('clonedDiv dimensions:', clonedDiv.offsetWidth, clonedDiv.offsetHeight);

    // Render content with html2canvas
    // console.log('Rendering notice content with html2canvas');
    let canvas;
    try {
        canvas = await html2canvas(clonedDiv, {
            scale: 2, // Reduced scale for performance
            useCORS: true,
            allowTaint: true,
            windowWidth: clonedDiv.scrollWidth,
            windowHeight: Math.min(clonedDiv.scrollHeight, 10000), // Cap rendering height
            backgroundColor: '#ffffff'
        });
        // console.log('html2canvas rendering complete. Canvas height:', canvas.height);
    } catch (error) {
        // console.error('html2canvas error:', error);
        throw new Error('Failed to render notice content');
    } finally {
        document.body.removeChild(clonedDiv);
        // console.log('Temporary div removed');
    }

    // Paginate and add content to PDF
    const totalHeight = canvas.height;
    let yOffsetPx = 0;
    const MAX_PAGES = 50; // Reasonable limit for a legal notice
    let pageCount = 0;
    // console.log('Starting PDF page generation. Total height:', totalHeight, 'Page height (px):', pageHeightPx);
    while (yOffsetPx < totalHeight && pageCount < MAX_PAGES) {
        pageCount++;
        // console.log(`Processing page ${pageCount}`);

        let renderHeightPx = Math.min(pageHeightPx, totalHeight - yOffsetPx);
        // console.log('Render height (px) for page', pageCount, ':', renderHeightPx);

        doc.addImage(
            canvas,
            'PNG',
            marginLeft,
            marginTop - (yOffsetPx * mmPerPx),
            pageWidth - 2 * marginLeft,
            renderHeightPx * mmPerPx,
            undefined,
            'FAST'
        );

        yOffsetPx += renderHeightPx;

        if (yOffsetPx < totalHeight) {
            doc.addPage();
        }
    }

    if (pageCount >= MAX_PAGES && yOffsetPx < totalHeight) {
        // console.error('Maximum page limit exceeded');
        throw new Error('Document exceeds maximum page limit of 50 pages');
    }

    // console.log('PDF page generation completed. Total pages:', pageCount);
    const pdfBlob = doc.output('blob');
    // console.log('PDF blob size (bytes):', pdfBlob.size);
    return pdfBlob;
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