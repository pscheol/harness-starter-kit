// 왼쪽 목차에 지금 읽는 절을 표시한다. 스크립트가 없어도 목차 링크는 그대로 동작한다.
(() => {
  const nav = document.querySelector(".site-nav [aria-current='page']");
  if (nav) nav.scrollIntoView({ block: "nearest", inline: "center" });

  const links = new Map();
  document.querySelectorAll(".page-toc a[href^='#']").forEach((a) => {
    links.set(decodeURIComponent(a.hash.slice(1)), a);
  });
  if (!links.size || !("IntersectionObserver" in window)) return;

  const headings = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let current = null;

  const setCurrent = (id) => {
    if (id === current) return;
    current = id;
    links.forEach((a, key) => {
      if (key === id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        if (entry.isIntersecting) {
          setCurrent(id);
        } else if (entry.boundingClientRect.top > 0 && current === id) {
          const index = headings.indexOf(entry.target);
          setCurrent(index > 0 ? headings[index - 1].id : null);
        }
      });
    },
    { rootMargin: "-90px 0px -70% 0px" }
  );

  headings.forEach((heading) => observer.observe(heading));
})();
