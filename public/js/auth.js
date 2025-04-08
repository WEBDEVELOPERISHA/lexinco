document.addEventListener('DOMContentLoaded', function() {
    // Signup Form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // Validation
            if (password !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }
            if (password.length < 8) {
                alert('Password must be at least 8 characters!');
                return;
            }

            try {
                // Send OTP
                const response = await fetch('/api/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                if (!response.ok) throw new Error('Failed to send OTP');

                // Hide signup form, show OTP form
                signupForm.style.display = 'none';
                document.getElementById('otp-verification').style.display = 'block';
                document.getElementById('otp-email-display').textContent = email;

                // Store form data temporarily
                window.signupData = { name, email, password };

            } catch (error) {
                alert(error.message);
            }
        });
    }

    // OTP Form Submission
    const otpForm = document.getElementById('otp-form');
    if (otpForm) {
        otpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const otp = document.getElementById('otp').value;

            try {
                const response = await fetch('/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...window.signupData, otp })
                });

                if (!response.ok) throw new Error('Invalid OTP');

                alert('Account created! Redirecting...');
                window.location.href = '/legal-notice.html';

            } catch (error) {
                alert(error.message);
            }
        });
    }
    // Login Form
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            window.location.href = 'legal-notice.html';
            sessionStorage.setItem('isLoggedIn', 'true');
            

        } catch (error) {
            alert(error.message);
        }
    });
}

    // Resend OTP
    const resendLink = document.getElementById('resend-otp-link');
    if (resendLink) {
        resendLink.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch('/api/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: window.signupData.email })
                });
                alert('New OTP sent!');
            } catch (error) {
                alert('Failed to resend OTP');
            }
        });
    }
});