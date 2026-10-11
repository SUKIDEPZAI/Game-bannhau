const SHATTER_SVG = `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><g class="crack-main"><path d="M500 475 405 350 318 333 271 238 201 211"/><path d="M500 475 575 361 664 322 706 226 793 188"/><path d="M500 475 383 504 304 585 206 599 152 696"/><path d="M500 475 610 526 687 602 782 623 840 719"/><path d="M500 475 477 348 510 251 478 172 499 90"/><path d="M500 475 461 585 486 680 447 780 467 901"/><path d="M500 475 579 458 648 485 726 458 799 490"/><path d="M500 475 424 439 354 444 300 403 226 413"/><path d="M405 350 365 278 318 333 270 309"/><path d="M664 322 721 347 706 226 749 245"/><path d="M304 585 332 651 206 599 181 644"/><path d="M687 602 659 680 782 623 813 665"/><path d="M477 348 433 286 451 222"/><path d="M610 526 625 571 674 584"/><path d="M461 585 407 621 392 691"/><path d="M579 458 619 411 675 407"/></g><g class="crack-fine"><path d="M500 475 535 420 526 380"/><path d="M500 475 458 462 423 476"/><path d="M500 475 528 516 519 555"/><path d="M500 475 476 425 481 395"/><path d="M500 475 551 477 586 464"/><path d="M318 333 288 350 264 345"/><path d="M706 226 681 204 687 180"/><path d="M206 599 171 577 145 588"/><path d="M782 623 813 608 840 624"/></g></svg>`;

export class EffectLayer {
  constructor(root = document.getElementById("gestureEffects")) { this.root = root; this.lastPlay = new Map(); }
  play(name, duration = 1200, { cooldown = 250 } = {}) {
    if (!this.root || !["shatter", "burst", "confetti", "rainbow", "hearts", "shockwave", "slash"].includes(name)) return false;
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? -Infinity) < cooldown) return false;
    this.lastPlay.set(name, now);
    this.root.querySelectorAll(`.gesture-effect.effect-${name}`).forEach(el => el.remove());
    const el = document.createElement("div"); el.className = `gesture-effect effect-${name}`; el.setAttribute("aria-hidden", "true");
    if (name === "shatter") el.innerHTML = `${SHATTER_SVG}<div class="shatter-flash"></div><div class="shatter-label">💥 BẮN TRÚNG!</div>`;
    else if (name === "burst") el.innerHTML = `<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>`;
    else if (name === "confetti") el.innerHTML = Array.from({ length: 24 }, (_, i) => `<i style="--i:${i};--x:${(i * 37 % 96) + 2}%;--d:${(i % 5) * 35}ms"></i>`).join("");
    else if (name === "rainbow") el.innerHTML = `<div class="rainbow-wash"></div>`;
    else if (name === "hearts") el.innerHTML = `♥ <i>♥</i><b>♥</b><em>♥</em>`;
    else if (name === "shockwave") el.innerHTML = `<i></i><b></b><em></em>`;
    else if (name === "slash") el.innerHTML = `<i></i><b></b>`;
    this.root.append(el);
    const cleanupMs = name === "shatter" ? 3000 : duration;
    setTimeout(() => el.remove(), cleanupMs + 100);
    return true;
  }
}
