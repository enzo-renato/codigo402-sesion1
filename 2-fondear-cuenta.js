const miLlavePublica = "GAB54KEZ7ZOXY2QWCML3NDVL3PFF3F56P7ZUJBM3YTIL5L2S42EGKA3P";

console.log("Solicitando XLM de prueba al Friendbot...");

const respuesta = await fetch(`https://friendbot.stellar.org?addr=${miLlavePublica}`);
const datos = await respuesta.json();

console.log("¡Cuenta fondeada exitosamente en la Testnet!");