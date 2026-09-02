# DOSSIER COMPLET — Course Réelle

**Nom canonique : Course Réelle** · domaine : `coursereelle.fr` · dépôt : `coursereelle`
*« L'observatoire des courses de livraison » reste un sous-titre descriptif ; le nom du projet, lui, est unique.*

> Un site indépendant où les livreurs publient leurs courses réelles, vérifiées
> automatiquement, pour révéler l'écart entre les annonces des plateformes et la
> réalité du terrain.

---

## 1. Ouverture : une course qui dit tout

Un livreur accepte une course de 12,2 km payée 8,08 €. Temps estimé par l'application :
16 minutes. Temps réel, de l'acceptation à la remise au client : 32 minutes.

Le calcul : 8,08 € pour 32 minutes = 15,15 €/h de chiffre d'affaires brut. Après environ
21 % de cotisations URSSAF et les frais de véhicule, il reste autour de 10 €/h — pendant
la course uniquement. En ajoutant l'attente avant la course suivante, le revenu réel passe
sous les 8 €/h.

Sur le papier, ce livreur bénéficie pourtant d'une garantie de 19 € brut par heure
d'activité. L'écart vient du fait que la garantie est calculée sur le temps estimé par la
plateforme et sur le seul temps « en course » — pas sur le temps vécu. Ce dossier documente
cet écart et présente l'outil qui le rendra visible.

---

## 2. La réalité du terrain

Depuis le 1er septembre, un avenant signé sous l'égide de l'ARPE entre les plateformes
(Uber Eats, Deliveroo) et les syndicats Union-Indépendants et FNAE porte le revenu minimal
garanti de 11,75 € à 19 € brut par heure d'activité — une hausse de plus de 60 %, désormais
calculée par semaine, pourboires exclus. Sur le papier, une avancée majeure. Dans les faits,
quatre mécanismes la vident de sa substance :

1. **Le temps d'attente n'est pas compté.** Les 19 € s'appliquent uniquement au temps
   « en course ». Le syndicat SUD Commerce l'a chiffré : deux courses de 15 minutes séparées
   par 30 minutes d'attente, et le taux réel tombe à 9,50 €/h.

2. **Le temps « en course » est estimé, pas mesuré.** L'application calcule un temps théorique
   qui ignore les bouchons, l'attente au restaurant, les escaliers, les parkings. Une course
   vécue en 32 minutes peut être comptée 16. Plus l'estimation est courte, plus le taux horaire
   calculé paraît élevé, et moins la plateforme verse de complément.

3. **Les minima annoncés ne sont pas toujours respectés sur le terrain.** Uber Eats communique
   sur un minimum de 3 € par course. Or des livreurs constatent des courses payées en dessous
   de ce seuil. Personne ne sait aujourd'hui dans quels cas exacts (courses groupées,
   annulations, zones particulières) : aucune donnée indépendante n'existe. Le site documentera
   ce phénomène, captures vérifiées à l'appui.

4. **Les 19 € sont un chiffre d'affaires brut.** Le livreur micro-entrepreneur en déduit ses
   cotisations, son essence, son entretien, son assurance, son téléphone — sans congés payés,
   sans chômage, sans mutuelle.

Ce constat est étayé par des sources officielles : l'ARPE a documenté une baisse de 34 % de la
rémunération horaire réelle entre 2021 et 2024 en euros constants ; 80 % des livreurs Uber Eats
restaient sous le SMIC effectif selon ses données d'avril 2025 ; et l'ANSES pointe le management
algorithmique comme facteur majeur de stress. Même l'État manque de données indépendantes : les
bilans de l'ARPE sont construits à partir des données fournies par les plateformes elles-mêmes,
et dans un groupe de travail officiel, les plateformes ont contesté les estimations sur le
partage de la valeur sans produire de données alternatives.

---

## 3. L'idée : un miroir automatique

Construire un site où les livreurs publient leurs courses réelles, avec preuve, et où un système
automatique — pas un humain — vérifie, valide et publie. Le site n'accuse personne. Il affiche :
« voici l'engagement public, voici les courses vérifiées, jugez vous-même. » Personne ne peut
trafiquer les données, pas même les créateurs du site : les règles de validation sont publiques
et codées.

Des précédents existent et ont fait leurs preuves à l'étranger :

- **Rodeo** (Royaume-Uni) — les livreurs « travaillaient à l'aveugle » avant de pouvoir suivre
  leurs vrais revenus.
- **Driver's Seat** (États-Unis) — coopérative de travailleurs dont les données alimentent les
  politiques publiques.
- **UberCheats** — a fait rembourser des livreurs en comparant distances payées et réelles.
- **FairFare** — données crowdsourcées éclairant les législateurs du Colorado.

Aucun équivalent n'existe en France. C'est la place à prendre, au moment précis où la
transposition de la directive européenne sur le travail de plateforme met le sujet au centre du
débat.

---

## 4. Les données collectées

**Par course :** ville, plateforme, véhicule, distance, prix payé, temps estimé par l'app, temps
réel chronométré, pourboire, capture d'écran du récapitulatif (preuve, jamais publiée).

**Par session — la donnée décisive :** heure de connexion, heure de déconnexion, nombre de
courses, revenu total. C'est elle qui capture ce que l'accord ignore : le temps connecté sans
course. Le ratio temps payé / temps connecté par ville sera la statistique phare.

**Le site calcule automatiquement :** taux horaire réel, taux horaire selon l'estimation de
l'app, écart entre les deux, net estimé après cotisations, et conformité à la grille annoncée.

---

## 5. La validation : 100 % automatique

Aucun humain ne valide ou ne rejette. Cinq filtres codés :

**Filtre 1 — Cohérence physique uniquement.** Rejet des impossibilités matérielles : vitesse
aberrante pour le véhicule déclaré, distance hors bornes, image illisible.
*Règle de conception fondamentale : les règles annoncées par les plateformes ne sont jamais des
critères de rejet.* Une course payée 2,60 € n'est pas une « erreur » à filtrer — c'est une preuve
à publier. Seule la physique rejette ; les annonces des plateformes, elles, servent de référence
de comparaison.

**Filtre 2 — Lecture automatique de la capture (OCR).** Le système lit le prix, la distance et le
temps estimé directement sur la capture du récapitulatif et les compare aux chiffres saisis.
Correspondance → validé. Divergence → rejeté avec motif. Le livreur ne peut pas inventer ses
chiffres : la machine vérifie la preuve. (Tesseract gratuit, ou Google Cloud Vision :
1 000 images/mois gratuites.)

**Filtre 3 — Anti-fraude.** Hash d'image contre les doublons, limite de soumissions par appareil,
Turnstile contre les bots, détection de rafales suspectes.

**Filtre 4 — Détection statistique des aberrations.** Au-delà de quelques centaines de courses,
toute valeur s'écartant de plus de 3 écarts-types de la distribution est exclue des statistiques
publiques (statut « hors distribution ») — méthode standard, décrite dans la page Méthode.

**Filtre 5 — Le temps réel, fiabilisé par la masse.** Seule donnée invérifiable par OCR (elle
n'apparaît nulle part — c'est justement ce que la plateforme ne montre pas), le temps réel est
fiabilisé statistiquement : les exagérations isolées sont éliminées par le filtre 4, et sur
500 courses la moyenne est robuste. Évolution future : une app qui chronomètre automatiquement
(bouton « acceptée » / « livrée »).

Chaque course validée est ensuite classée automatiquement : conforme à la grille annoncée /
sous le minimum annoncé (< 3 €) / sous la grille kilométrique / temps estimé incohérent. Chaque
catégorie devient une statistique publique. Le rôle des créateurs du site se limite à surveiller
ce que les filtres rejettent les premières semaines pour ajuster les règles — **le système décide,
l'humain règle le système.**

---

## 6. Le cadre juridique

Les livreurs sont propriétaires de leurs données de courses ; les partager est un droit renforcé
par le RGPD, et ils peuvent même exiger des plateformes l'export complet de leur historique
(portabilité). L'anonymat public est absolu : aucun nom, aucun identifiant ; les captures servent
à la vérification automatique puis sont supprimées ou caviardées — réponse à la crainte légitime
de désactivation de compte. Et le site publie des faits, jamais des intentions : jamais
« Uber triche », toujours « voici l'annonce, voici les données, voici l'écart ». Sa critique de
fond est déjà portée publiquement par des syndicats représentatifs et documentée par l'ARPE et
l'ANSES : le site s'inscrit dans un débat existant.

---

## 7. Structure du site

Sept pages publiques :

| Page | Rôle |
| --- | --- |
| Accueil | Le chiffre choc + compteur de courses vérifiées |
| Publier une course | Formulaire avec calcul en direct |
| Publier une session | Formulaire session |
| Les courses | Liste anonymisée |
| Statistiques | Par ville, plateforme, catégorie, dans le temps |
| Méthode | Chaque règle de validation, publiée intégralement |
| FAQ | Est-ce légal, risques, anonymat |

Plus un **tableau de surveillance privé** (lecture seule : ce que les filtres rejettent et
pourquoi).

Dès la saisie, le formulaire affiche en direct : « Votre taux horaire réel : 15,10 €/h brut —
l'app a estimé 30,30 €/h. » Ce retour immédiat est ce qui donne envie de contribuer : le livreur
reçoit un service, pas seulement une demande.

---

## 8. Stack technique — 100 % gratuite

Next.js hébergé sur Vercel (site + API dans un seul projet) · base de données Neon
(PostgreSQL gratuit) · captures sur Cloudflare R2 (10 Go gratuits) · anti-bot Cloudflare
Turnstile · OCR Tesseract ou Google Cloud Vision (palier gratuit). Seule dépense : le nom de
domaine (~10 €).

```
coursereelle/
├── app/
│   ├── page.tsx                    → Accueil
│   ├── publier/page.tsx            → Formulaire course (calcul en direct)
│   ├── session/page.tsx            → Formulaire session
│   ├── courses/page.tsx            → Liste anonymisée
│   ├── statistiques/page.tsx       → Stats par ville / catégorie
│   ├── methode/page.tsx            → Méthodologie publique
│   ├── faq/page.tsx
│   ├── surveillance/page.tsx       → Lecture seule (privé)
│   └── api/
│       ├── courses/route.ts        → Soumission → pipeline de validation
│       ├── sessions/route.ts
│       ├── stats/route.ts
│       └── upload/route.ts         → Capture vers R2
├── lib/
│   ├── db.ts                       → Connexion Neon
│   ├── calculs.ts                  → Taux horaire, écarts, net estimé
│   ├── classification.ts           → Conforme / sous minimum / sous grille
│   └── validation/
│       ├── regles-physiques.ts     → Filtre 1
│       ├── ocr.ts                  → Filtre 2
│       ├── anti-fraude.ts          → Filtre 3
│       └── outliers.ts             → Filtre 4
├── components/
│   ├── FormulaireCourse.tsx
│   ├── CalculEnDirect.tsx
│   ├── BadgeCategorie.tsx          → "Sous le minimum annoncé", etc.
│   └── TableauCourses.tsx
├── sql/schema.sql
└── .env.local                      → Clés Neon, R2, Turnstile, OCR
```

Statuts en base : `validee_auto` · `rejetee_auto` (avec motif) · `hors_distribution`.

---

## 9. Roadmap — 8 semaines

**Semaine 1 — Fondations.** Nom : **Course Réelle** (fixé). Domaine : **coursereelle.fr**, à sécuriser avant toute communication. Comptes GitHub, Vercel, Neon, Cloudflare. Tables
`courses` et `sessions`. Rédaction de la page Méthode **en premier** (elle fige les définitions et
les règles des filtres).

**Semaine 2 — Formulaire + pipeline.** Formulaire course avec calcul en direct, upload R2,
Turnstile, filtres 1 et 3 (physique + anti-fraude).

**Semaine 3 — OCR + statistiques.** Filtre 2 (lecture des captures, calibré sur de vrais
récapitulatifs), classification automatique, page Statistiques, formulaire session.

**Semaine 4 — Contenu + mise en ligne silencieuse.** Accueil avec l'exemple 12,2 km / 8,08 €,
FAQ, mentions légales et politique de confidentialité (RGPD). En ligne, sans communication.

**Semaine 5 — Test fermé.** 10-20 livreurs testeurs via des groupes WhatsApp/Telegram. Objectif :
50 courses validées automatiquement. Critère absolu : le formulaire se remplit en moins de
90 secondes sur téléphone, entre deux courses. Ajustement des filtres selon ce qu'ils rejettent.

**Semaine 6 — Relais.** Présentation aux syndicats (Union-Indépendants, FNAE, SUD, CGT-livreurs)
et aux grands groupes de livreurs, données en main. Kit de diffusion : un visuel + un message à
copier-coller.

**Semaine 7 — Lancement public.** Diffusion ville par ville. Statistiques publiées dès 100 courses
validées (avant ce seuil : compteur seulement — un site vide décrédibilise).

**Semaine 8 — Presse + extension.** Contact des journalistes qui couvrent déjà l'accord des
19 €/h et les rapports ARPE. Ajout de Deliveroo/Stuart si la demande existe. Bilan et ajustements.

---

## 10. Pérennité

Trois pistes pour que le projet survive à son créateur : adossement à un ou plusieurs syndicats
(qui gagnent l'outil de preuve qu'ils réclament — la leçon de Rodeo : ces données doivent
appartenir aux livreurs, pas à un acteur commercial) ; modèle coopératif sur l'exemple de
Driver's Seat ; ou financement participatif des livreurs. La confiance est la monnaie du projet.

---

## 11. Conclusion

L'idée n'est pas de changer les plateformes ni de créer un conflit. L'idée est de publier la
réalité — vérifiée par une machine selon des règles publiques, classée automatiquement, anonyme —
pour que les livreurs disposent enfin d'un outil qui montre ce qu'ils vivent. Un miroir que
personne ne tient : il tient tout seul. Et il arrive au moment précis où tout le monde regarde.
