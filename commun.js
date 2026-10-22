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
  if (/UNIVERSITE_INVALIDE/.test(m)) return "L'université d'étude est obligatoire.";
  if (/NIVEAU_INVALIDE/.test(m)) return "Le niveau de formation est obligatoire.";
  if (/ACTION_INTERDITE/.test(m)) return "Cette action n'est pas autorisée dans l'état actuel.";
  if (/SEMAINE_FUTURE/.test(m)) return "Vous ne pouvez pas rédiger le bilan d'une semaine à venir.";
  if (/SEMAINE_HORS_STAGE/.test(m)) return "Cette semaine est en dehors de la période de votre stage.";
  if (/HORS_PERIODE_STAGE/.test(m)) return "Les dates doivent se situer dans la période de votre stage.";
  if (/duplicate key/i.test(m)) return "Cet enregistrement existe déjà.";
  if (/row-level security/i.test(m)) return "Action refusée. Vérifiez que votre stage est bien rattaché à votre compte.";
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

/* ---------- Semaines, mouvements et bilans ---------- */
const hm = (h) => (h ? h.slice(0, 5) : "");
const maintenantHM = () => new Date().toTimeString().slice(0, 5);
const ajouterJours = (iso, n) => new Date(jourUTC(iso) + n * 86400000).toISOString().slice(0, 10);
const lundiDe = (iso) => ajouterJours(iso, -((new Date(jourUTC(iso)).getUTCDay() + 6) % 7));
const periodeSemaine = (lundi) => dateFr(lundi) + " au " + dateFr(ajouterJours(lundi, 6));

const TYPES_MOUVEMENT = {
  sortie: "Sortie / permission",
  weekend: "Sortie de week-end",
  absence: "Absence",
  retard: "Retard",
  mission: "Mission / déplacement"
};
const AVEC_RETOUR = ["sortie", "weekend", "mission"];
const STATUTS_MOUVEMENT = { en_attente: "En attente", approuve: "Approuvée", refuse: "Refusée" };
const STATUTS_BILAN = {
  brouillon: "Brouillon",
  soumis: "Soumis, en attente de visa",
  vise: "Visé",
  a_corriger: "À corriger"
};

function periodeMouvement(m) {
  const hd = hm(m.heure_depart);
  const hr = hm(m.heure_retour);
  if (m.date_debut === m.date_fin) {
    let t = "Le " + dateFr(m.date_debut);
    if (hd && hr) t += " de " + hd + " à " + hr;
    else if (hd) t += " à partir de " + hd;
    else if (hr) t += ", retour prévu à " + hr;
    return t;
  }
  return "Du " + dateFr(m.date_debut) + (hd ? " à " + hd : "") +
    " au " + dateFr(m.date_fin) + (hr ? " à " + hr : "");
}

const enMinuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1);

// Sortie approuvée dont le retour n'est pas confirmé alors que l'heure prévue est dépassée.
function retourEnRetard(m) {
  if (m.statut !== "approuve" || m.retour_confirme_le || !AVEC_RETOUR.includes(m.type)) return false;
  const t = aujourdhui();
  if (m.date_fin < t) return true;
  return m.date_fin === t && !!m.heure_retour && maintenantHM() > hm(m.heure_retour);
}

/* ---------- Pastilles de statut ---------- */
const TON_MOUVEMENT = { en_attente: "attente", approuve: "ok", refuse: "ko" };
const TON_BILAN = { brouillon: "neutre", soumis: "attente", vise: "ok", a_corriger: "ko" };

function pastille(texte, ton) {
  const s = document.createElement("span");
  s.className = "pastille " + (ton || "neutre");
  s.textContent = texte;
  return s;
}

/* ---------- Période d'un stage et ses semaines ---------- */
// Lundis de toutes les semaines du stage : de la semaine du début jusqu'à la semaine de la date de fin.
function semainesDuStage(s) {
  const liste = [];
  for (let l = lundiDe(s.date_debut); l <= s.date_fin; l = ajouterJours(l, 7)) liste.push(l);
  return liste;
}
const periodeStage = (s) => dateFr(s.date_debut) + " - " + dateFr(s.date_fin);
const lienStage = (page, s) => page + "?stage=" + encodeURIComponent(s.id);
const bornerDate = (iso, min, max) => (iso < min ? min : iso > max ? max : iso);

// Stage demandé dans l'adresse (?stage=...), sinon le stage affiché par défaut.
function stageDemande(stages) {
  const id = new URLSearchParams(location.search).get("stage");
  return stages.find((x) => x.id === id) || periodeParDefaut(stages);
}
