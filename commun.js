const $ = (id) => document.getElementById(id);
const dateFr = (d) => (d ? d.split("-").reverse().join("/") : "");
const aujourdhui = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-JJ
const formaterCode = (c) => (c ? c.slice(0, 5) + "-" + c.slice(5) : "");

function dire(id, texte, classe) {
  const el = $(id);
  el.textContent = texte;
  el.className = "message " + (classe || "");
}

function messageErreur(error) {
  const m = (error && error.message) || "";
  if (/DEJA_ENREGISTRE/.test(m)) return "Vous êtes déjà enregistré avec ces mêmes dates de début et de fin.";
  if (/STAGE_CHEVAUCHANT/.test(m)) return "Un stage est déjà enregistré sur une période qui chevauche celle-ci. Il n'est pas possible d'échelonner deux stages.";
  if (/NOM_INVALIDE/.test(m)) return "Le nom saisi n'est pas valide.";
  if (/invalid login credentials/i.test(m)) return "Adresse e-mail ou mot de passe incorrect.";
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cette adresse e-mail. Connectez-vous.";
  if (/password/i.test(m)) return "Le mot de passe est trop court ou trop faible.";
  if (/failed to fetch|network/i.test(m)) return "Connexion impossible. Vérifiez votre connexion internet.";
  return "L'opération a échoué. Vérifiez les informations et réessayez.";
}

/* ---------- Calcul des jours restants ---------- */
function jourUTC(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, j);
}
const joursEntre = (debut, fin) => Math.round((jourUTC(fin) - jourUTC(debut)) / 86400000);
const jours = (n) => n + " jour" + (n > 1 ? "s" : "");

function messageStage(s) {
  const t = aujourdhui();
  const periode = dateFr(s.date_debut) + " - " + dateFr(s.date_fin);
  if (t < s.date_debut) {
    return "Votre stage à la DSA commence dans " + jours(joursEntre(t, s.date_debut)) + ", période " + periode + ".";
  }
  if (t > s.date_fin) {
    return "Votre stage à la DSA est terminé, période " + periode + ".";
  }
  const n = joursEntre(t, s.date_fin);
  if (n === 0) {
    return "Aujourd'hui est le dernier jour de votre stage à la DSA, période " + periode + ".";
  }
  return "Il vous reste " + jours(n) + " pour finir votre stage à la DSA, période " + periode + ".";
}

// Période affichée par défaut : en cours, sinon la prochaine, sinon la plus récente.
// La liste est triée du plus récent au plus ancien (date de début).
function periodeParDefaut(liste) {
  const t = aujourdhui();
  const enCours = liste.find((s) => s.date_debut <= t && t <= s.date_fin);
  if (enCours) return enCours;
  const aVenir = liste.filter((s) => s.date_debut > t).sort((a, b) => (a.date_debut < b.date_debut ? -1 : 1));
  if (aVenir.length) return aVenir[0];
  return liste[0];
}
