# Suivi des stages à la DSA : mise en ligne

Application indépendante de la première : nouveau projet Supabase, nouveau dépôt GitHub.

## Les pages

| Page | Rôle |
|---|---|
| `index.html` | Accueil avec les trois possibilités |
| `stage.html` | Renseigner les informations du stage (et renouveler un stage depuis son espace) |
| `inscription.html` | Créer son compte stagiaire avec le code de rattachement |
| `connexion.html` | Connexion du stagiaire |
| `espace.html` | Espace du stagiaire : jours restants et choix de la période |
| `admin.html` | Espace administrateur : consultation, modification, suppression, export Excel |

## 1. Nouveau projet Supabase

1. Sur https://supabase.com, cliquez sur **New project** (même organisation, plan gratuit).
2. Nommez-le par exemple `stages-dsa`, générez un mot de passe de base de données et notez-le.
3. Cochez **Enable Data API** et **Enable automatic RLS**. Laissez **Automatically expose new tables** coché.

## 2. Créer la base de données

Dans **SQL Editor > New query**, collez tout le contenu de `supabase-stages.sql` et cliquez sur **Run**. Confirmez l'avertissement orange avec **Run query**. Résultat attendu : **Success. No rows returned**.

## 3. Régler l'authentification

Ouvrez **Authentication > Sign In / Providers > Email** :
- **Allow new users to sign up** : laissez **activé** (les stagiaires créent eux-mêmes leur compte).
- **Confirm email** : **désactivez-le**, sinon chaque stagiaire devra confirmer son adresse par e-mail, et l'envoi d'e-mails du plan gratuit est très limité.

Cliquez sur **Save changes**.

## 4. Créer l'administrateur

1. **Authentication > Users > Add user > Create new user**, avec e-mail, mot de passe et **Auto Confirm User** coché.
2. Dans **SQL Editor**, désignez-le administrateur (remplacez l'adresse) :

```sql
insert into administrateurs (user_id)
select id from auth.users where email = 'admin@exemple.com';
```

## 5. Relier les pages à Supabase

Dans **Project Settings > API Keys**, copiez la **Project URL** et la **Publishable key**, puis collez-les dans `config.js`. Ne copiez jamais la clé secret.

## 6. Héberger sur GitHub

1. Créez un nouveau dépôt **public** (par exemple `suivi_stages_dsa`).
2. Déposez tous les fichiers de ce dossier, sauf `supabase-stages.sql` et `LISEZMOI.md` si vous préférez ne pas les publier.
3. **Settings > Pages > Deploy from a branch**, branche `main`, dossier `/ (root)`, **Save**.
4. Le site est disponible à `https://VOTRE-NOM.github.io/NOM-DU-DEPOT/`.

## 7. Parcours du stagiaire

1. **Renseigner les informations de mon stage** : il reçoit un code de rattachement.
2. **M'inscrire** : e-mail, mot de passe et code (prérempli sur le même appareil).
3. **Me connecter** : il voit « Il vous reste N jours pour finir votre stage à la DSA, période JJ/MM/AAAA - JJ/MM/AAAA ».
4. Pour un nouveau stage, il clique sur **Déclarer un nouveau stage** depuis son espace. Une liste déroulante de périodes apparaît dès qu'il a plusieurs stages.

## Règles appliquées par la base de données

- Mêmes dates de début et de fin pour la même personne : refusé (« Vous êtes déjà enregistré »).
- Période qui chevauche un autre stage de la même personne : refusé.
- Les stages à des dates successives, sans chevauchement, sont acceptés.
- La personne est reconnue par son nom et prénoms, sans tenir compte des accents, des majuscules ni de l'ordre des mots.
- Un stagiaire ne voit que ses propres stages et ne peut pas les modifier. Les corrections passent par l'administrateur.
