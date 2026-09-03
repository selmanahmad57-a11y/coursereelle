-- Course Réelle — schéma de base
--
-- PostgreSQL (Neon). À appliquer tel quel : psql "$DATABASE_URL" -f sql/schema.sql
--
-- Trois principes gouvernent ce schéma, et aucun n'est négociable :
--
-- 1. Aucune donnée identifiante. Il n'existe volontairement AUCUNE colonne
--    d'adresse IP, de compte, d'identifiant d'appareil en clair, de quartier,
--    d'adresse ou de code postal. La ville est la granularité maximale.
--    Le contrôle de fréquence fonctionne sans jamais écrire d'adresse : voir la
--    section « anti-fraude » plus bas.
--
-- 2. Les vocabulaires métier ne sont pas dupliqués ici. Plateformes, véhicules,
--    zones et villes viennent de config/baremes.schema.json et config/villes.json,
--    qui font foi ; l'API valide contre eux avant d'écrire. Les contraindre une
--    seconde fois en SQL créerait deux sources de vérité qui divergeraient.
--    Seuls les vocabulaires propres au cycle de vie en base (statut, catégorie)
--    sont contraints ici, et config/libelles.json en porte les libellés — un test
--    vérifie que les deux listes restent identiques.
--
-- 3. Les jugements restent interprétables pour toujours. Une classification fige
--    la date de référence, la clé du barème appliqué et sa valeur d'alors. Un
--    avenant qui change la garantie ne réécrit donc jamais le passé.

create extension if not exists pgcrypto;


-- ─────────────────────────────────────────────────────────────────────────────
-- Courses
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists courses (
  id                      uuid primary key default gen_random_uuid(),
  soumise_le              timestamptz not null default now(),

  -- Date à laquelle la course a eu lieu. C'est elle, jamais « aujourd'hui », qui
  -- sert à résoudre les barèmes datés au moment de la classification.
  date_course             date not null,

  -- Slug issu de config/villes.json. NULL quand le livreur a choisi « Autre
  -- ville » : la saisie brute part alors dans villes_saisies_libres.
  ville_slug              text,
  -- Zone tarifaire déduite de la ville, jamais demandée au livreur.
  zone                    text,
  plateforme              text not null,
  vehicule                text not null,

  distance_km             numeric(6, 2) not null,
  -- Ce que la plateforme a payé, hors pourboire. C'est le montant que toutes les
  -- comparaisons utilisent.
  prix_paye_euros         numeric(7, 2) not null,
  -- Donnée source unique : les deux taux horaires en sont dérivés, jamais stockés.
  pourboire_euros         numeric(7, 2),
  duree_estimee_minutes   integer not null,
  duree_reelle_minutes    integer not null,

  -- Capture d'écran : preuve de vérification, jamais publiée.
  capture_cle_r2          text,
  -- Empreinte de l'image, pour refuser deux fois la même preuve.
  capture_hash            text,
  capture_supprimee_le    timestamptz,

  -- Ce que l'OCR a lu sur la capture, conservé pour pouvoir auditer un rejet et
  -- calibrer le filtre 2 sur de vrais récapitulatifs.
  ocr_prix_euros          numeric(7, 2),
  ocr_distance_km         numeric(6, 2),
  ocr_duree_estimee_minutes integer,

  statut                  text not null check (statut in ('validee_auto', 'rejetee_auto', 'hors_distribution')),
  -- Renseigné si et seulement si la course est rejetée.
  motif_rejet             text,
  -- Quel filtre a rejeté : 1 physique, 2 OCR, 3 anti-fraude, 4 hors distribution.
  filtre_rejet            smallint check (filtre_rejet between 1 and 4),
  classee_le              timestamptz,

  constraint motif_si_rejet
    check ((statut = 'rejetee_auto') = (motif_rejet is not null)),
  constraint duree_reelle_positive check (duree_reelle_minutes > 0),
  constraint duree_estimee_positive check (duree_estimee_minutes > 0),
  constraint distance_positive check (distance_km > 0),
  constraint capture_hash_unique unique (capture_hash)
);

create index if not exists courses_date_idx on courses (date_course);
create index if not exists courses_statut_idx on courses (statut);
create index if not exists courses_ville_idx on courses (ville_slug);
create index if not exists courses_plateforme_idx on courses (plateforme);


-- Saisies « Autre ville », gardées brutes et à part.
-- Elles ne sont pas mélangées aux villes normalisées : une statistique par ville
-- exige des libellés stables. Quand une saisie libre revient assez souvent, elle
-- est normalisée à la main puis la ville entre dans config/villes.json.
create table if not exists villes_saisies_libres (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references courses (id) on delete cascade,
  saisie_brute        text not null,
  -- Rempli à la main lors de la normalisation, NULL tant qu'elle n'a pas eu lieu.
  ville_slug_normalise text,
  normalisee_le       timestamptz,
  creee_le            timestamptz not null default now()
);

create index if not exists villes_libres_saisie_idx on villes_saisies_libres (lower(saisie_brute));


-- ─────────────────────────────────────────────────────────────────────────────
-- Classification
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Une course validée porte SOIT une ligne « conforme », SOIT une ou plusieurs
-- lignes de non-conformité : une même course peut très bien être à la fois sous
-- le minimum annoncé et sous la grille kilométrique, et les deux méritent d'être
-- comptées.
--
-- Chaque ligne fige ce qui a servi à juger : la date de référence, la clé du
-- barème et sa valeur à cette date. Un barème qui change plus tard ne rend donc
-- aucune classification passée fausse ni illisible.

create table if not exists classifications (
  course_id        uuid not null references courses (id) on delete cascade,
  categorie        text not null check (categorie in ('conforme', 'sous_minimum_annonce', 'sous_grille_kilometrique', 'temps_estime_incoherent')),

  -- NULL pour « conforme », qui ne se rattache à aucun barème en particulier.
  cle_bareme       text,
  valeur_bareme    numeric(10, 4),
  valeur_constatee numeric(10, 4),

  -- La date de la course, recopiée ici pour que la ligne reste interprétable
  -- seule, sans jointure ni configuration courante.
  date_reference   date not null,
  calculee_le      timestamptz not null default now(),

  primary key (course_id, categorie),
  constraint bareme_absent_si_conforme
    check ((categorie = 'conforme') = (cle_bareme is null))
);

create index if not exists classifications_categorie_idx on classifications (categorie);


-- ─────────────────────────────────────────────────────────────────────────────
-- Sessions
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La donnée décisive : le temps connecté sans course, que l'accord ignore.
-- Le ratio temps payé / temps connecté par ville sortira d'ici.

create table if not exists sessions (
  id                  uuid primary key default gen_random_uuid(),
  soumise_le          timestamptz not null default now(),

  date_session        date not null,
  ville_slug          text,
  plateforme          text not null,
  vehicule            text,

  connexion_le        timestamptz not null,
  deconnexion_le      timestamptz not null,
  nombre_courses      integer not null,
  revenu_total_euros  numeric(8, 2) not null,

  statut              text not null check (statut in ('validee_auto', 'rejetee_auto', 'hors_distribution')),
  motif_rejet         text,

  constraint session_ordonnee check (deconnexion_le > connexion_le),
  constraint nombre_courses_positif check (nombre_courses >= 0),
  constraint motif_si_rejet_session
    check ((statut = 'rejetee_auto') = (motif_rejet is not null))
);

create index if not exists sessions_date_idx on sessions (date_session);
create index if not exists sessions_ville_idx on sessions (ville_slug);


-- ─────────────────────────────────────────────────────────────────────────────
-- Anti-fraude, sans jamais stocker d'adresse
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Le filtre 3 doit limiter le nombre de soumissions par appareil. Le faire en
-- stockant les adresses IP créerait exactement le risque que le site promet
-- d'écarter : une adresse, croisée avec une date, une heure et une ville, peut
-- réidentifier un livreur.
--
-- Mécanisme retenu :
--
--   1. Un sel aléatoire est tiré pour la journée et conservé le temps de la
--      fenêtre de rétention (barème « retention_empreintes », publié sur la page
--      Méthode).
--   2. À chaque soumission, le serveur calcule
--          empreinte = SHA-256(sel_du_jour || adresse)
--      et n'écrit que cette empreinte. L'adresse n'est jamais écrite nulle part,
--      ni en clair ni chiffrée.
--   3. Passée la fenêtre, le sel du jour est SUPPRIMÉ. Les empreintes calculées
--      avec lui deviennent alors irréversibles : plus personne, nous compris, ne
--      peut relier une empreinte ancienne à une adresse, même en connaissant
--      l'adresse. Les compteurs correspondants sont purgés dans la foulée.
--
-- Le sel change chaque jour, donc une même adresse produit une empreinte
-- différente le lendemain : aucun suivi dans la durée n'est possible, y compris
-- par nous.

create table if not exists sels_journaliers (
  jour      date primary key,
  sel       text not null,
  cree_le   timestamptz not null default now()
);

-- Compteur de la limite horaire. « heure » est un horodatage tronqué à l'heure.
create table if not exists soumissions_horaires (
  empreinte  text not null,
  heure      timestamptz not null,
  compteur   integer not null default 0,

  primary key (empreinte, heure)
);

-- Compteur de la limite journalière, et suivi des échecs OCR consécutifs.
create table if not exists activite_appareil (
  empreinte              text not null,
  jour                   date not null,
  soumissions            integer not null default 0,
  echecs_ocr_consecutifs integer not null default 0,
  pause_jusqu_a          timestamptz,

  primary key (empreinte, jour)
);

-- Purge. À exécuter quotidiennement ; c'est la suppression du sel qui rend les
-- empreintes du jour concerné définitivement irréversibles.
-- La fenêtre vient du barème « retention_empreintes » : elle est passée en
-- paramètre plutôt qu'écrite ici, pour rester une valeur de configuration.
--
--   delete from sels_journaliers      where jour  < current_date - $1::integer;
--   delete from activite_appareil     where jour  < current_date - $1::integer;
--   delete from soumissions_horaires  where heure < now() - make_interval(days => $1);
