import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: { invoiceNumber: 'G01' },
        include: {
            paymentItems: { include: { payment: true } }
        }
    })
    console.log(JSON.stringify(invoices, null, 2))
}
main()
