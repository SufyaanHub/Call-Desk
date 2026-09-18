const header = document.getElementById("siteHeader");
const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.getElementById("siteNav");
const revealElements = document.querySelectorAll(".reveal");
const showcaseStage = document.getElementById("showcaseStage");
const parallaxItems = document.querySelectorAll(".parallax-item");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function updateHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 12);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

menuToggle.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    siteNav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

if (reducedMotion) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );

  revealElements.forEach((element) => observer.observe(element));
}

if (!reducedMotion && showcaseStage && parallaxItems.length > 0) {
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = null;

  function renderParallax() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;

    parallaxItems.forEach((item) => {
      const depth = Number(item.dataset.depth || 0);
      item.style.transform = `translate3d(${currentX * depth * 100}px, ${currentY * depth * 100}px, 0)`;
    });

    if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
      frame = requestAnimationFrame(renderParallax);
    } else {
      frame = null;
    }
  }

  function queueParallax() {
    if (frame === null) {
      frame = requestAnimationFrame(renderParallax);
    }
  }

  showcaseStage.addEventListener("mousemove", (event) => {
    const rect = showcaseStage.getBoundingClientRect();
    targetX = (event.clientX - rect.left) / rect.width - 0.5;
    targetY = (event.clientY - rect.top) / rect.height - 0.5;
    queueParallax();
  });

  showcaseStage.addEventListener("mouseleave", () => {
    targetX = 0;
    targetY = 0;
    queueParallax();
  });
}
