"use strict";

/* Préréglages de véhicules (données indicatives).
   conso : kWh / 100 km par cycle. */
const VEHICULES = [
  {
    id: "elroq85",
    nom: "Škoda Elroq Clever 85",
    capaUtile: 82, capaBrute: 85,
    obc: 11, dcMax: 175,
    conso: { urbain: 13.0, campagne: 15.5, autoroute: 21.0, mixte: 15.5 }
  },
  {
    id: "zoe",
    nom: "Renault Zoé ZE50",
    capaUtile: 52, capaBrute: 54.5,
    obc: 22, dcMax: 50,
    conso: { urbain: 13.5, campagne: 15.5, autoroute: 21.5, mixte: 17.7 }
  },
  {
    id: "spring",
    nom: "Dacia Spring",
    capaUtile: 26.8, capaBrute: 27.4,
    obc: 6.6, dcMax: 30,
    conso: { urbain: 12.0, campagne: 14.0, autoroute: 18.5, mixte: 13.9 }
  },
  {
    id: "e208",
    nom: "Peugeot e-208",
    capaUtile: 46, capaBrute: 50,
    obc: 11, dcMax: 100,
    conso: { urbain: 13.0, campagne: 15.0, autoroute: 20.0, mixte: 15.4 }
  },
  {
    id: "megane",
    nom: "Renault Mégane E-Tech EV60",
    capaUtile: 60, capaBrute: 65,
    obc: 22, dcMax: 130,
    conso: { urbain: 13.5, campagne: 15.0, autoroute: 19.5, mixte: 15.5 }
  },
  {
    id: "model3",
    nom: "Tesla Model 3 Propulsion",
    capaUtile: 60, capaBrute: 60,
    obc: 11, dcMax: 170,
    conso: { urbain: 11.5, campagne: 13.5, autoroute: 18.0, mixte: 14.0 }
  },
  {
    id: "kona",
    nom: "Hyundai Kona Electric 64",
    capaUtile: 64, capaBrute: 64,
    obc: 11, dcMax: 80,
    conso: { urbain: 13.5, campagne: 15.5, autoroute: 20.5, mixte: 15.9 }
  },
  {
    id: "id3",
    nom: "Volkswagen ID.3 Pro",
    capaUtile: 58, capaBrute: 77,
    obc: 11, dcMax: 120,
    conso: { urbain: 13.5, campagne: 15.0, autoroute: 19.0, mixte: 15.3 }
  },
  {
    id: "i4",
    nom: "BMW i4 eDrive40",
    capaUtile: 70.3, capaBrute: 83.9,
    obc: 11, dcMax: 200,
    conso: { urbain: 14.0, campagne: 16.0, autoroute: 21.0, mixte: 16.1 }
  },
  {
    id: "custom",
    nom: "Véhicule personnalisé",
    capaUtile: 60, capaBrute: 65,
    obc: 11, dcMax: 130,
    conso: { urbain: 14.0, campagne: 16.0, autoroute: 20.0, mixte: 16.0 }
  }
];
