// Thème : clair par défaut. Le visiteur peut choisir Clair, Sombre ou Auto (préférence de l'appareil).
(function () {
  var CLE = "theme_choisi";
  var ORDRE = ["clair", "sombre", "auto"];
  var NOMS = { clair: "Thème : clair", sombre: "Thème : sombre", auto: "Thème : automatique" };

  function lire() {
    try { var v = localStorage.getItem(CLE); return ORDRE.indexOf(v) >= 0 ? v : "clair"; }
    catch (e) { return "clair"; }
  }
  function appliquer(t) { document.documentElement.setAttribute("data-theme", t); }

  appliquer(lire()); // appliqué tout de suite pour éviter un flash

  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "theme-btn";
    function maj() { var t = lire(); b.textContent = NOMS[t]; b.title = "Changer de thème"; }
    b.addEventListener("click", function () {
      var suivant = ORDRE[(ORDRE.indexOf(lire()) + 1) % ORDRE.length];
      try { localStorage.setItem(CLE, suivant); } catch (e) {}
      appliquer(suivant);
      maj();
    });
    maj();
    document.body.appendChild(b);
  });
})();
