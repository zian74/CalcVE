# Calculateur d'autonomie — voiture électrique

Application statique en **HTML / CSS / JavaScript**, sans dépendance ni serveur : ouvrir simplement `index.html` dans un navigateur.

## Fichiers

- `index.html` — structure de la page
- `style.css` — mise en page
- `vehicules.js` — préréglages de véhicules (capacité batterie, chargeur embarqué, charge DC max, consommations par cycle)
- `app.js` — calculs et affichage des résultats

## Paramètres pris en compte

- Capacité de la batterie (utile et brute)
- Chargeur embarqué du véhicule (kW AC) — limite la charge en AC
- Puissance de la borne (AC ou DC)
- Niveau initial et niveau d'arrêt de la charge
- Pertes de charge (%, augmentées par le froid)
- Température extérieure et préconditionnement de la batterie
- Consommations par cycle : urbain, campagne, autoroute, mixte WLTP (+ mix personnalisé)
- Vitesse moyenne, chauffage/clim, coffre de toit, trajet vallonné, charge utile

## Résultats affichés

- Temps de charge pour atteindre le niveau d'arrêt (intégration de la courbe DC, avec ralentissement au-delà de 60–80 %)
- Énergie rechargée (batterie et réseau) et puissance moyenne
- Temps par paliers (10→80 %, 80→100 %)
- Distance estimée avant d'atteindre 10 %, depuis le niveau actuel et après la charge
- Autonomie par cycle (urbain / campagne / autoroute / mixte)
- Coût de la charge, coût au 100 km (VE vs thermique)
- Empreinte CO₂ du trajet (VE vs thermique)
- Simulation d'un long trajet : nombre d'arrêts et temps total
- Courbes graphiques : niveau de batterie dans le temps et puissance de charge selon le niveau
