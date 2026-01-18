
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkJobs() {
    try {
        const jobs = await prisma.scanningJob.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        console.log('--- LATEST SCANNING JOBS ---');
        jobs.forEach(job => {
            console.log(`ID: ${job.id}`);
            console.log(`Created: ${job.createdAt}`);
            console.log(`Status: ${job.status}`);
            console.log(`Progress: ${job.progress}%`);
            console.log(`Items: ${job.processedCount} / ${job.totalItems}`);
            console.log(`Error: ${job.error || 'None'}`);
            console.log(`Results: ${JSON.stringify(job.results)}`);
            console.log('---------------------------');
        });
    } catch (e) {
        console.error('Error fetching jobs:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkJobs();
