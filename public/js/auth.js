document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signup-form');
    const otpForm = document.getElementById('otp-form');
    const loginForm = document.getElementById('login-form');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const salutation = document.getElementById('salutation').value;
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (password !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }
            if (password.length < 8) {
                alert('Password must be at least 8 characters!');
                return;
            }

            try {
                const response = await fetch('/api/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to send OTP');

                signupForm.style.display = 'none';
                document.getElementById('otp-verification').style.display = 'block';
                document.getElementById('otp-email-display').textContent = email;

                window.signupData = { name, email, password, salutation };

            } catch (error) {
                alert(error.message);
            }
        });
    }

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

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Invalid OTP');

                sessionStorage.setItem('lexinco_user', JSON.stringify(data.user));
                alert('Account created successfully!');
                window.location.href = 'feed.html'; // or your feed page

            } catch (error) {
                alert(error.message);
            }
        });
    }

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
                if (!response.ok) throw new Error(data.error || 'Login failed');

                sessionStorage.setItem('lexinco_user', JSON.stringify(data.user));
                alert('Login successful!');

                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect') || 'feed.html';
                window.location.href = redirect;

            } catch (error) {
                alert(error.message);
            }
        });
    }

    // Resend OTP
    document.getElementById('resend-otp-link')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch('/api/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: window.signupData.email })
            });
            alert('New OTP sent!');
        } catch {
            alert('Failed to resend');
        }
    });
});