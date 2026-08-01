#!/usr/bin/env node
'use strict';

/**
 * PostgreSQL Seed 导入脚本
 *
 * 用法: node scripts/import-data.js <seed-name>
 * 示例: node scripts/import-data.js my-seed
 *       node scripts/import-data.js my-seed.seed
 *
 * 配置来源: 按优先级读取 .env.${NODE_ENV}.local > .env.local > .env.${NODE_ENV} > .env
 *           （process.env 中已有的同名变量优先级最高），取 DATABASE_URL
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const PROJECT_ROOT = path.join(__dirname, '..');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');

/**
 * 解析单个 .env 文件，返回键值对（支持引号包裹的值与行内 export 前缀）
 */
function parseEnvFile(filePath) {
    const vars = {};
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        // 去掉包裹引号（dotenv 风格）
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        vars[match[1]] = value;
    }
    return vars;
}

/**
 * 按 Next.js 优先级加载 .env 文件：
 * .env.${NODE_ENV}.local > .env.local（test 环境除外）> .env.${NODE_ENV} > .env
 * process.env 中已有的变量优先级最高，不会被覆盖
 */
function loadEnv() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const files = [
        `.env.${nodeEnv}.local`,
        ...(nodeEnv !== 'test' ? ['.env.local'] : []),
        `.env.${nodeEnv}`,
        '.env'
    ];

    const vars = { ...process.env };
    for (const file of files) {
        const filePath = path.join(PROJECT_ROOT, file);
        if (!fs.existsSync(filePath)) continue;
        console.log(`📄 加载配置: ${file}`);
        const parsed = parseEnvFile(filePath);
        for (const key of Object.keys(parsed)) {
            if (!(key in vars)) {
                vars[key] = parsed[key];
            }
        }
    }
    return vars;
}

/**
 * 创建 PrismaClient（显式传入解析出的 DATABASE_URL）
 */
function createClient(databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
    const { PrismaClient } = require('@prisma/client');
    return new PrismaClient();
}

/**
 * 将 SQL 文本拆分为单条语句
 * （Prisma 走预处理协议不支持多语句，需逐条执行）
 * 正确处理：单引号字符串、双引号标识符、行注释、块注释、dollar-quoted 字符串
 */
function splitStatements(sql) {
    const stmts = [];
    let cur = '';
    let i = 0;
    const n = sql.length;
    let state = 'normal'; // normal | sq | dq | line | block | dollar
    let dollarTag = null;

    while (i < n) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (state === 'normal') {
            if (ch === "'") { state = 'sq'; cur += ch; i++; }
            else if (ch === '"') { state = 'dq'; cur += ch; i++; }
            else if (ch === '-' && next === '-') { state = 'line'; i += 2; }
            else if (ch === '/' && next === '*') { state = 'block'; i += 2; }
            else if (ch === '$') {
                const m = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
                if (m) { state = 'dollar'; dollarTag = m[0]; cur += m[0]; i += m[0].length; }
                else { cur += ch; i++; }
            }
            else if (ch === ';') { if (cur.trim()) stmts.push(cur); cur = ''; i++; }
            else { cur += ch; i++; }
        } else if (state === 'sq') {
            cur += ch;
            if (ch === "'" && next === "'") { cur += next; i += 2; }
            else if (ch === "'") { state = 'normal'; i++; }
            else i++;
        } else if (state === 'dq') {
            cur += ch;
            if (ch === '"' && next === '"') { cur += next; i += 2; }
            else if (ch === '"') { state = 'normal'; i++; }
            else i++;
        } else if (state === 'line') {
            if (ch === '\n') { state = 'normal'; cur += ch; }
            i++;
        } else if (state === 'block') {
            if (ch === '*' && next === '/') { state = 'normal'; i += 2; }
            else i++;
        } else if (state === 'dollar') {
            if (sql.startsWith(dollarTag, i)) { cur += dollarTag; i += dollarTag.length; state = 'normal'; }
            else { cur += ch; i++; }
        }
    }
    if (cur.trim()) stmts.push(cur);
    return stmts;
}

/**
 * 解析 seed 文件，获取需要执行的 SQL 文件列表
 * 支持 # 开头的注释行
 */
function parseSeedFile(seedFilePath) {
    if (!fs.existsSync(seedFilePath)) {
        throw new Error(`Seed 文件不存在: ${seedFilePath}`);
    }

    const content = fs.readFileSync(seedFilePath, 'utf8');
    const lines = content.split('\n');

    const sqlFiles = [];
    for (const line of lines) {
        const trimmed = line.trim();
        // 跳过空行和注释行
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        sqlFiles.push(trimmed);
    }

    return sqlFiles;
}

/**
 * 执行单个 SQL 文件（逐条语句执行）
 */
async function executeSqlFile(client, sqlFilePath) {
    if (!fs.existsSync(sqlFilePath)) {
        throw new Error(`SQL 文件不存在: ${sqlFilePath}`);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // 去除 BOM
    const cleanSql = sqlContent.replace(/^\uFEFF/, '');

    console.log(`   📥 读取文件 (${(fs.statSync(sqlFilePath).size / 1024).toFixed(2)} KB)`);

    const statements = splitStatements(cleanSql);
    for (const stmt of statements) {
        await client.$executeRawUnsafe(stmt);
    }
    return statements.length;
}

/**
 * 主函数
 */
async function main() {
    // 解析命令行参数
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('❌ 错误: 请提供 seed 文件名');
        console.log('');
        console.log('用法: node scripts/import-data.js <seed-name>');
        console.log('');
        console.log('示例:');
        console.log('  node scripts/import-data.js my-seed');
        console.log('  node scripts/import-data.js my-seed.seed');
        console.log('');
        console.log('可用的 seed 文件:');

        // 列出所有可用的 seed 文件
        if (fs.existsSync(BACKUPS_DIR)) {
            const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.seed'));
            if (files.length === 0) {
                console.log('  (暂无)');
            } else {
                files.forEach(f => console.log(`  - ${f.replace('.seed', '')}`));
            }
        }
        process.exit(1);
    }

    let seedName = args[0];
    // 自动添加 .seed 后缀（如果没有）
    if (!seedName.endsWith('.seed')) {
        seedName += '.seed';
    }

    const seedFilePath = path.join(BACKUPS_DIR, seedName);

    console.log('🌱 PostgreSQL Seed 导入工具');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // 加载配置
    const env = loadEnv();
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('❌ 未找到 DATABASE_URL（.env/.env.local 或环境变量）');
        process.exit(1);
    }

    // 解析 seed 文件
    let sqlFiles;
    try {
        sqlFiles = parseSeedFile(seedFilePath);
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }

    console.log(`📋 Seed 文件: ${seedName}`);
    console.log(`   包含 ${sqlFiles.length} 个 SQL 文件:`);
    sqlFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file}`);
    });
    console.log('');

    // 连接到数据库
    const client = createClient(databaseUrl);
    try {
        const host = new URL(databaseUrl).hostname;
        console.log(`🔗 连接到 PostgreSQL: ${host}`);
        await client.$queryRawUnsafe('SELECT 1');
        console.log('✅ 连接成功');
        console.log('');
    } catch (error) {
        console.error(`❌ 数据库连接失败: ${error.message}`);
        await client.$disconnect();
        process.exit(1);
    }

    // 尝试关闭外键/触发器约束（需要超级用户权限，失败则警告后继续）
    try {
        await client.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
        console.log('🔓 已临时关闭外键/触发器约束（session_replication_role=replica）');
    } catch {
        console.log('⚠️  无权限设置 session_replication_role，按原样导入（如有外键依赖请注意文件顺序）');
    }
    console.log('');

    // 执行 SQL 文件
    console.log('🚀 开始导入数据...');
    console.log('');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < sqlFiles.length; i++) {
        const sqlFile = sqlFiles[i];
        const sqlFilePath = path.join(BACKUPS_DIR, sqlFile);
        const progress = `[${i + 1}/${sqlFiles.length}]`;

        console.log(`${progress} 📄 ${sqlFile}`);

        try {
            const stmtCount = await executeSqlFile(client, sqlFilePath);
            console.log(`   ✅ 导入成功 (${stmtCount} 条语句)`);
            successCount++;
        } catch (error) {
            console.log(`   ❌ 导入失败: ${error.message.split('\n').pop()}`);
            failCount++;
        }
        console.log('');
    }

    // 恢复约束开关（若之前设置成功，同一连接上复位）
    try {
        await client.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    } catch {
        // 忽略：未设置过或无权限
    }

    // 关闭连接
    await client.$disconnect();

    // 输出总结
    console.log('═══════════════════════════════════════════');
    console.log('📊 导入完成');
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失败: ${failCount}`);
    console.log('');

    if (failCount > 0) {
        process.exit(1);
    }
}

// 运行主函数
main().catch(error => {
    console.error(`❌ 脚本执行失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
