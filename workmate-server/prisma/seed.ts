import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  await prisma.adminWhitelist.createMany({
    data: [
      { ruleType: 'list', ruleValue: '022480', remark: '初始管理员' },
      { ruleType: 'prefix', ruleValue: '022*', remark: '02部门管理员' },
    ],
    skipDuplicates: true,
  })

  console.log('Seed completed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })