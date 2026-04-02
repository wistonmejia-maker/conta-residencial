import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- DIAGNÓSTICO DE PROVEEDORES DUPLICADOS ---')
  
  // 1. Obtener todos los proveedores con su conteo de facturas
  const providers = await prisma.provider.findMany({
    include: {
      _count: {
        select: { invoices: true }
      }
    }
  })

  console.log(`\nTotal de proveedores en la BD: ${providers.length}`)

  // 2. Agrupar por NIT normalizado (solo números, sin DV final si está embebido)
  const groupedByNit = new Map<string, any[]>()
  
  for (const p of providers) {
    let cleanNit = p.nit.replace(/[^0-9]/g, '')
    
    // Si el NIT tiene 10 o más dígitos y termina en algo parecido al DV original
    // Por ejemplo 9009682971 => 900968297
    if (cleanNit.length > 9 && p.nit.includes('-')) {
        const parts = p.nit.split('-')
        cleanNit = parts[0].replace(/[^0-9]/g, '')
    }

    if (!groupedByNit.has(cleanNit)) {
      groupedByNit.set(cleanNit, [])
    }
    groupedByNit.get(cleanNit)!.push(p)
  }

  // 3. Encontrar duplicados
  let totalDuplicates = 0
  const groupsToFix = []

  for (const [nit, group] of groupedByNit.entries()) {
    if (group.length > 1) {
      totalDuplicates += (group.length - 1)
      groupsToFix.push({
          nit,
          providers: group.map(p => ({
              id: p.id,
              name: p.name,
              originalNit: p.nit,
              dv: p.dv,
              email: p.email,
              invoicesCount: p._count.invoices
          }))
      })
    }
  }

  console.log(`\nSe encontraron ${groupsToFix.length} grupos con NITs duplicados (${totalDuplicates} registros extra en total)`)
  
  // Imprimir los grupos
  for (const group of groupsToFix) {
      console.log(`\n🔹 Grupo NIT: ${group.nit}`)
      console.table(group.providers)
  }

  // 4. Buscar NITs ficticios o inválidos
  console.log('\n--- POSIBLES NITS FICTICIOS O DE PRUEBA ---')
  const suspicious = providers.filter(p => {
      const cleanNit = p.nit.replace(/[^0-9]/g, '')
      return cleanNit.match(/^(\d)\1+$/) || // Ej. 800000000
             cleanNit.match(/1234/)          // Ej. 900654321
  })

  if (suspicious.length > 0) {
      console.table(suspicious.map(p => ({
          name: p.name,
          nit: p.nit,
          invoicesCount: p._count.invoices
      })))
  } else {
      console.log('No se encontraron NITs obviamente ficticios.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
