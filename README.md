# StockFlow

StockFlow est un logiciel Windows de gestion de stock destiné aux boutiques de vente d'accessoires électroniques et de réparation de téléphones. Il fonctionne entièrement hors ligne et stocke toutes les données localement.

![Licence](https://img.shields.io/badge/licence-MIT-blue)
![Electron](https://img.shields.io/badge/Electron-43-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6)

## Fonctionnalités

- **Tableau de bord** — indicateurs en temps réel : produits, valeur du stock, ventes du jour, réparations en cours, alertes de rupture.
- **Produits** — CRUD complet, nom auto-généré (Catégorie + Marque + Modèle), recherche instantanée, tri par colonne, gestion des archivages, ajustement de stock avec historique.
- **Stock** — vue de gestion des mouvements de stock (entrées/sorties) avec motifs.
- **Ventes** — panier, remises, modes de paiement, édition et annulation de ventes.
- **Réparations** — suivi des fiches (statuts, pièces, main d'œuvre, reste dû).
- **Historique** — journal complet de toutes les actions.
- **Rapports** — statistiques de ventes et de stock.
- **Sauvegardes** — sauvegarde locale de la base de données (automatique et manuelle), restauration.
- **Paramètres** — mot de passe, question secrète, nom de boutique, catégories et marques.
- **Recherche globale** — recherche instantanée produits / ventes / réparations.
- **Authentification locale** — mot de passe hashé (scrypt), question secrète, verrouillage après échecs.
- **100 % hors ligne** — aucune donnée ne quitte la machine.

## Stack technique

| Couche | Technologie |
|---|---|
| Shell | Electron 43 |
| UI | React 19 + React Router 7 |
| Langage | TypeScript 7 |
| Build | Vite 8 + electron-builder |
| Base de données | SQLite locale (sql.js, stockée en fichier) |
| Styles | CSS (design system maison) |

## Prérequis

- [Node.js](https://nodejs.org/) ≥ 20 (testé avec Node 25)
- npm

## Installation

```bash
git clone https://github.com/Eder225/StockFlow.git
cd StockFlow
npm install
```

## Développement

```bash
npm run dev
```

Lance le serveur Vite avec hot-reload et Electron en mode développement.

## Build de production

```bash
npm run build
```

Compile TypeScript, build le bundle Vite puis génère l'installateur Windows (NSIS) dans le dossier `release/`.

## Téléchargement

Les installateurs sont disponibles sur la page [Releases](https://github.com/Eder225/StockFlow/releases).

> **Note Windows** : l'installateur n'est actuellement pas signé numériquement. Windows affichera un avertissement SmartScreen au premier lancement — cliquez sur « Informations supplémentaires » puis « Exécuter quand même ». Le code est open source et vérifiable.

## Structure du projet

```
StockFlow/
├── electron/               # Processus principal (main)
│   ├── main.ts             # Point d'entrée Electron, handlers IPC
│   ├── preload.ts          # API exposée au renderer (contextBridge)
│   ├── logger.ts
│   └── database/           # Couche données
│       ├── db.ts           # Schéma SQLite, migrations, seeds
│       ├── handlers.ts     # Handlers IPC métier
│       ├── sqlite-wrapper.ts
│       ├── crypto.ts       # Hash scrypt des mots de passe
│       └── backup.ts       # Sauvegardes / restauration
├── src/                    # Processus renderer (UI React)
│   ├── pages/              # Écrans (Dashboard, Products, Sales…)
│   ├── components/         # Composants réutilisables
│   ├── types/              # Types TypeScript de l'API Electron
│   └── styles/
├── index.html
├── vite.config.ts
└── package.json
```

## Licence

Distribué sous la licence [MIT](LICENSE).
