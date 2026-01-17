# Reglas de Entrenamiento y Exclusión de IA (Conta Residencial)

Este documento centraliza las reglas lógicas, exclusiones y patrones de aprendizaje utilizados por el sistema de escaneo de Gmail y análisis de documentos para Propiedad Horizontal.

## 1. Reglas de Clasificación (Prompt Engineering)

### Facturas (INVOICE)
*   **Objetivo**: Capturar cobros de proveedores.
*   **Criterios Positivos**: Palabras como "Factura de Venta", "Cuenta de Cobro", "Documento Equivalente".
*   **Datos Clave**: NIT Emisor, Nombre Proveedor, Número Factura, Total, Fecha.

### Pagos (PAYMENT_RECEIPT)
*   **Objetivo**: Capturar **SALIDAS** de dinero (Egresos) desde la cuenta del conjunto.
*   **Criterios Positivos**: "Comprobante de Transferencia", "Pago Exitoso", referencias a bancos (Bancolombia, AV Villas).
*   **Direccionalidad**: El dinero debe salir de la cuenta del PH.

### Exclusiones (OTHER) - "Lista Negra"
Documentos que el sistema ignora intencionalmente para no ensuciar la contabilidad:
1.  **Recaudos de Residentes**:
    *   Cualquier documento que diga "Comprobante de Recaudo", "Consignación", "Depósito".
    *   Referencias a unidades privadas: "Apto", "Apartamento", "Torre", "Interior", "Casa".
    *   *Razón*: Estos son ingresos (cuotas de administración), no gastos operativos.
2.  **Estados de Cuenta**: Resúmenes mensuales que no son soportes transaccionales individuales.

## 2. Lógica de Validación (Código)

### Validación de NIT
*   **Regla**: Comparación "Leniente".
*   **Detalle**: Se comparan solo los primeros 9 dígitos del NIT (Base).
*   **Razón**: Ignorar el Dígito de Verificación (DV) evita errores cuando la IA lee un "1" en lugar de un "7", o cuando el proveedor escribe el NIT de forma diferente (con/sin guion).

### Detección de Duplicados
*   **Facturas**: Se busca si ya existe una factura activa con el mismo `ProveedorID` y `Número de Factura`.
*   **Pagos**: Se busca si ya existe un pago con la misma `Referencia Bancaria` (CUS/Id Transacción) y `Monto Exacto`.

## 3. Registro de Aprendizaje (Feedback Loop)

Utilice esta sección para anotar casos donde la IA falló o procesó algo indebido, para ajustar las reglas en futuras actualizaciones.

| Fecha | Tipo Doc | Error Detectado | Acción Correctiva Sugerida |
|-------|----------|-----------------|----------------------------|
| 17/01/2026 | Recibo AV Villas | Procesó un pago de residente (Apto 501) como egreso | Se agregó regla explicita para ignorar "Recaudos" y palabras "Apto/Torre" |
| | | | |
| | | | |
