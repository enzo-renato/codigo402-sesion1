import { Keypair } from '@stellar/stellar-sdk';

// Generamos un nuevo par de claves aleatorias
const parDeClaves = Keypair.random();

console.log("Tu Llave Pública (Wallet ID):", parDeClaves.publicKey());
console.log("Tu Llave Secreta (¡Guárdala bien!):", parDeClaves.secret());