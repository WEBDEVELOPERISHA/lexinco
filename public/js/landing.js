document.addEventListener('DOMContentLoaded', function () {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    const closeModalBtn = document.getElementById('closeModal');
    const offerModal = document.getElementById('offerModal');

    // Mobile menu toggle with smooth transition
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : ''; // Prevent scrolling when menu is open
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.add('fa-bars');
                icon.classList.remove('fa-times');
                document.body.style.overflow = ''; // Restore scrolling
            });
        });

        // Close menu on touch outside (mobile)
        document.addEventListener('touchstart', (e) => {
            if (!navLinks.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                navLinks.classList.remove('active');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.add('fa-bars');
                icon.classList.remove('fa-times');
                document.body.style.overflow = '';
            }
        });

        // Close menu on scroll (mobile)
        window.addEventListener('scroll', () => {
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.add('fa-bars');
                icon.classList.remove('fa-times');
                document.body.style.overflow = '';
            }
        });
    }

    // Modal functionality
    if (offerModal && closeModalBtn) {
        // Show modal if not previously closed in this session
        if (!sessionStorage.getItem('modalClosed')) {
            setTimeout(() => {
                offerModal.style.display = 'flex';
                offerModal.classList.add('active'); // For fade-in animation
            }, 1000); // Delay for better UX
        }

        // Close modal on button click
        closeModalBtn.addEventListener('click', () => {
            offerModal.classList.remove('active');
            setTimeout(() => {
                offerModal.style.display = 'none';
            }, 300); // Match CSS transition duration
            sessionStorage.setItem('modalClosed', 'true');
        });

        // Close modal on click outside
        offerModal.addEventListener('click', (e) => {
            if (e.target === offerModal) {
                offerModal.classList.remove('active');
                setTimeout(() => {
                    offerModal.style.display = 'none';
                }, 300);
                sessionStorage.setItem('modalClosed', 'true');
            }
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Testimonial Carousel with fade effect
    const testimonials = document.querySelectorAll('.testimonial');
    let currentTestimonial = 0;

    function showTestimonial(index) {
        testimonials.forEach((testimonial, i) => {
            testimonial.style.opacity = '0';
            testimonial.style.display = 'none';
            if (i === index) {
                testimonial.style.display = 'block';
                setTimeout(() => {
                    testimonial.style.opacity = '1';
                }, 50);
            }
        });
    }

    if (testimonials.length > 0) {
        showTestimonial(0);
        setInterval(() => {
            currentTestimonial = (currentTestimonial + 1) % testimonials.length;
            showTestimonial(currentTestimonial);
        }, 5000);
    }

    // Initialize AOS
    AOS.init({ duration: 1000, once: true, offset: 100 });
});

// Scroll to generator function
function scrollToGenerator() {
    document.getElementById('generator').scrollIntoView({
        behavior: 'smooth'
    });
}