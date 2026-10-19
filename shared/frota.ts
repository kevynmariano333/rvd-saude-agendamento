// A frota da RVD Saúde.
//
// A placa é o que a portaria digita com mais pressa e o que o histórico usa
// para juntar as chegadas do mesmo veículo — uma letra trocada separa em dois
// o que era um. A lista sugere as placas de casa pelo nome do veículo; a de
// fora continua sendo digitada, que é o caso que não dá para prever.
//
// Sem traço, do mesmo jeito que o formulário guarda.

export type Veiculo = { placa: string; nome: string };

export const FROTA: Veiculo[] = [
  { placa: "PPH5G79", nome: "Saveiro" },
  { placa: "DZE0F24", nome: "Sprinter" },
  { placa: "MQT8A82", nome: "Truck Volks" },
  { placa: "TLZ4J06", nome: "Sprinter" },
  { placa: "UGF4B58", nome: "Sprinter 03" },
  { placa: "EVC8B36", nome: "Iveco" },
];
