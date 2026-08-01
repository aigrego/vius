#!/usr/bin/env node
'use strict';

/**
 * PostgreSQL 数据导出脚本 - 每个表单独导出
 *
 * 用法: node scripts/export-data.js <seed-name> [options]
 *
 * 示例:
 *   # 导出全部表数据（每个表一个文件）
 *   node scripts/export-data.js my-seed
 *
 *   # 导出指定表数据
 *   node scripts/export-data.js my-seed --tables=watchlist,position
 *
 *   # 导出并排除某些表
 *   node scripts/export-data.js my-seed --exclude=news_flash,cron_run
 *
 *   # 使用 pg_dump 导出（推荐大数据量）
 *   node scripts/export-data.js my-seed --tables=watchlist --use-pgdump
 *
 *   # 只导出表结构
 *   node scripts/export-data.js my-seed --schema-only
 *
 * 配置来源: 按优先级读取 .env.${NODE_ENV}.local > .env.local > .env.${NODE_ENV} > .env
 *           （process.env 中已有的同名变量优先级最高），取 DATABASE_URL
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 路径配置
const PROJECT_ROOT = path.join(__dirname, '..');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');

// 默认排除的系统表（通常不需要导出）
const DEFAULT_EXCLUDE_TABLES = [
    '_prisma_migrations'
];

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
 * 解析 PostgreSQL 连接字符串（pg_dump 模式用）
 */
function parseConnectionString(connectionString) {
    const url = new URL(connectionString);
    return {
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        host: url.hostname,
        port: parseInt(url.port, 10) || 5432,
        database: url.pathname.replace(/^\//, '')
    };
}

/**
 * 标识符加双引号
 */
function qi(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
}

/**
 * 判断是否为 Prisma Decimal（构造器名被压缩，用结构特征判断）
 */
function isDecimal(val) {
    return val && typeof val === 'object' &&
        typeof val.toFixed === 'function' &&
        'd' in val && 'e' in val && 's' in val;
}

/**
 * PG 数组字面量: {1,2} / {"a","b"}
 */
function toArrayLiteral(arr) {
    return '{' + arr.map(v => {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
        const s = v instanceof Date ? v.toISOString() : String(v);
        return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }).join(',') + '}';
}

/**
 * 将 JS 值序列化为 PostgreSQL 字面量
 * （standard_conforming_strings=on 为默认，字符串只需转义单引号）
 */
function toSql(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : `'${val}'`;
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (val instanceof Date) return `'${val.toISOString()}'`;
    if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
        return `'\\x${Buffer.from(val).toString('hex')}'::bytea`;
    }
    if (Array.isArray(val)) return `'${toArrayLiteral(val).replace(/'/g, "''")}'`;
    if (isDecimal(val)) return val.toString();
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * 解析命令行参数
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        tables: '*',     // 默认导出全部表
        exclude: null,  // null 表示未指定，'' 表示显式指定为空
        usePgdump: false,
        schema: false,   // 默认不导出结构，只导出数据
        schemaOnly: false,
        dataOnly: true,  // 默认只导出数据
        where: '',
        limit: 0
    };

    let seedName = null;

    for (const arg of args) {
        if (arg.startsWith('--')) {
            const [key, ...valueParts] = arg.split('=');
            const value = valueParts.join('=');  // 处理值中包含 = 的情况
            const cleanKey = key.replace('--', '').replace(/-/g, '');

            if (cleanKey === 'tables') options.tables = value || '';
            else if (cleanKey === 'exclude') options.exclude = value !== undefined ? (value || '') : null;
            else if (cleanKey === 'usepgdump') options.usePgdump = true;
            else if (cleanKey === 'schema') options.schema = true;
            else if (cleanKey === 'schemaonly') { options.schemaOnly = true; options.dataOnly = false; }
            else if (cleanKey === 'dataonly') { options.dataOnly = true; options.schemaOnly = false; }
            else if (cleanKey === 'where') options.where = value || '';
            else if (cleanKey === 'limit') options.limit = parseInt(value, 10) || 0;
        } else if (!seedName) {
            seedName = arg;
        }
    }

    return { seedName, options };
}

/**
 * 检查 pg_dump 是否可用
 */
function checkPgdump() {
    return new Promise((resolve) => {
        const proc = spawn('pg_dump', ['--version'], { stdio: 'ignore' });
        proc.on('error', () => resolve(false));
        proc.on('exit', (code) => resolve(code === 0));
    });
}

/**
 * 使用 pg_dump 导出单个表
 */
async function exportTableWithPgdump(connParams, tableName, options) {
    const args = [
        '-h', connParams.host,
        '-p', String(connParams.port),
        '-U', connParams.user,
        '-d', connParams.database,
        '--no-owner',
        '--no-privileges',
        '--inserts',
        '--on-conflict-do-nothing',
        '-t', `public.${tableName}`
    ];

    // 只导出结构
    if (options.schemaOnly) {
        args.push('--schema-only');
    } else if (options.schema) {
        // 结构 + 数据：不加额外参数
    } else {
        // 只导出数据（默认）
        args.push('--data-only');
    }

    // WHERE 条件
    if (options.where) {
        args.push(`--where=${options.where}`);
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        const proc = spawn('pg_dump', args, {
            env: { ...process.env, PGPASSWORD: connParams.password }
        });

        proc.stdout.on('data', (chunk) => chunks.push(chunk));
        proc.stderr.on('data', (err) => {
            console.log(`   ⚠️  ${err.toString().trim()}`);
        });

        proc.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`pg_dump 退出码: ${code}`));
            } else {
                resolve(Buffer.concat(chunks).toString('utf8'));
            }
        });

        proc.on('error', reject);
    });
}

/**
 * 由 information_schema 推导列类型
 */
function columnType(c) {
    const len = c.character_maximum_length;
    const p = c.numeric_precision, s = c.numeric_scale, dp = c.datetime_precision;
    switch (c.udt_name) {
        case 'int2': return 'smallint';
        case 'int4': return 'integer';
        case 'int8': return 'bigint';
        case 'float4': return 'real';
        case 'float8': return 'double precision';
        case 'bool': return 'boolean';
        case 'varchar': return len ? `varchar(${len})` : 'varchar';
        case 'bpchar': return len ? `char(${len})` : 'char';
        case 'numeric': return p !== null ? `numeric(${p},${s ?? 0})` : 'numeric';
        case 'timestamp': return `timestamp${dp !== null ? `(${dp})` : ''} without time zone`;
        case 'timestamptz': return `timestamp${dp !== null ? `(${dp})` : ''} with time zone`;
        case 'timetz': return 'time with time zone';
        default:
            // 数组类型（udt_name 以 _ 开头）：去前缀后递归
            if (c.udt_name.startsWith('_')) {
                return columnType({ ...c, udt_name: c.udt_name.slice(1) }) + '[]';
            }
            // text/uuid/json/jsonb/bytea/date/time/interval/inet/枚举 等使用原名（加引号兼容大小写敏感）
            return qi(c.udt_name);
    }
}

/**
 * 生成单表 CREATE TABLE 语句（列 + 默认值 + 主键；索引/外键/唯一约束由 Prisma 迁移管理，不在此导出）
 * 同时返回 serial 列依赖的序列（DROP TABLE 会级联删序列，导入时需先重建）
 */
async function genCreateTable(client, tableName) {
    const columns = await client.$queryRawUnsafe(`
        SELECT column_name, data_type, udt_name, character_maximum_length, numeric_precision,
               numeric_scale, datetime_precision, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'
        ORDER BY ordinal_position
    `);

    if (columns.length === 0) {
        throw new Error(`表不存在: ${tableName}`);
    }

    // 主键（按 conkey 顺序）
    const regclass = `public.${qi(tableName)}`.replace(/'/g, "''");
    const pkRows = await client.$queryRawUnsafe(`
        SELECT a.attname
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.conrelid = '${regclass}'::regclass AND c.contype = 'p'
        ORDER BY k.ord
    `);

    // 收集 serial 列的序列（默认值形如 nextval('xxx_seq'::regclass)，名段可能带双引号）
    const sequences = [];
    const lines = columns.map(c => {
        let line = `  ${qi(c.column_name)} ${columnType(c)}`;
        if (c.column_default !== null) {
            const seqMatch = c.column_default.match(/^nextval\('([^']+)'(?:::regclass)?\)$/);
            if (seqMatch) {
                // 去掉各段的包裹双引号，忽略 schema 限定（默认 public）
                const parts = seqMatch[1].split('.').map(seg => seg.replace(/^"|"$/g, ''));
                sequences.push({ name: parts[parts.length - 1], column: c.column_name });
            }
            line += ` DEFAULT ${c.column_default}`;
        }
        if (c.is_nullable === 'NO') line += ' NOT NULL';
        return line;
    });

    if (pkRows.length > 0) {
        lines.push(`  PRIMARY KEY (${pkRows.map(r => qi(r.attname)).join(', ')})`);
    }

    // 收集枚举类型（data_type = USER-DEFINED），导入目标库可能还没有这些类型
    const enumTypes = [...new Set(
        columns.filter(c => c.data_type === 'USER-DEFINED').map(c => c.udt_name)
    )];

    let ddl = '';
    for (const enumName of enumTypes) {
        const labels = await client.$queryRawUnsafe(`
            SELECT e.enumlabel
            FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = '${enumName.replace(/'/g, "''")}'
            ORDER BY e.enumsortorder
        `);
        const values = labels.map(l => `'${l.enumlabel.replace(/'/g, "''")}'`).join(', ');
        ddl += `DO $$ BEGIN CREATE TYPE ${qi(enumName)} AS ENUM (${values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`;
    }
    for (const seq of sequences) {
        ddl += `CREATE SEQUENCE IF NOT EXISTS ${qi(seq.name)};\n`;
    }
    ddl += `CREATE TABLE ${qi(tableName)} (\n${lines.join(',\n')}\n);\n`;
    for (const seq of sequences) {
        ddl += `ALTER SEQUENCE ${qi(seq.name)} OWNED BY ${qi(tableName)}.${qi(seq.column)};\n`;
    }

    return { ddl, sequences };
}

/**
 * 使用 Node.js 导出单个表
 */
async function exportTableWithNode(client, tableName, options) {
    let output = '';

    // 添加文件头注释
    output += `-- Exported by export-data.js\n`;
    output += `-- Table: ${tableName}\n`;
    output += `-- Date: ${new Date().toISOString()}\n`;
    output += `--\n\n`;

    let rowCount = 0;
    let sequences = [];

    // 获取表结构（加了 --schema 或 --schema-only 时才导出）
    if (options.schema || options.schemaOnly) {
        const result = await genCreateTable(client, tableName);
        sequences = result.sequences;
        output += `-- Table structure for ${tableName}\n`;
        output += `DROP TABLE IF EXISTS ${qi(tableName)};\n`;
        output += `${result.ddl}\n`;
    }

    // 导出数据（默认行为）
    if (!options.schemaOnly) {
        let query = `SELECT * FROM ${qi(tableName)}`;
        if (options.where) {
            query += ` WHERE ${options.where}`;
        }
        if (options.limit > 0) {
            query += ` LIMIT ${options.limit}`;
        }

        const rows = await client.$queryRawUnsafe(query);
        rowCount = rows.length;

        if (rows.length > 0) {
            output += `-- Data for ${tableName} (${rows.length} rows)\n`;

            // 获取列名
            const columns = Object.keys(rows[0]);
            const columnList = columns.map(qi).join(', ');

            // 分批生成 INSERT 语句（每批 100 条）
            const BATCH_SIZE = 100;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const values = batch.map(row => {
                    return '(' + columns.map(col => toSql(row[col])).join(', ') + ')';
                }).join(',\n  ');

                output += `INSERT INTO ${qi(tableName)} (${columnList}) VALUES\n  ${values}\nON CONFLICT DO NOTHING;\n`;
            }
            output += '\n';
        } else {
            output += `-- Table ${tableName} is empty\n\n`;
        }

        // 重置 serial 序列到当前最大值，避免后续插入主键冲突
        for (const seq of sequences) {
            output += `SELECT setval('${qi(seq.name).replace(/'/g, "''")}', COALESCE((SELECT MAX(${qi(seq.column)}) FROM ${qi(tableName)}), 1));\n`;
        }
        if (sequences.length > 0) output += '\n';
    }

    return { content: output, rowCount };
}

/**
 * 获取数据库中的所有表
 */
async function getAllTables(client) {
    const rows = await client.$queryRawUnsafe(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `);

    return rows.map(r => r.table_name);
}

/**
 * 更新或创建 .seed 文件
 * 如果文件已存在，保留未导出的表条目，只更新/添加新导出的表
 */
function updateSeedFile(seedName, sqlFiles, exportedTableNames) {
    const seedFilePath = path.join(BACKUPS_DIR, `${seedName}.seed`);

    let allFiles = [...sqlFiles];
    let existingCount = 0;

    // 如果 seed 文件已存在，读取现有条目
    if (fs.existsSync(seedFilePath)) {
        const content = fs.readFileSync(seedFilePath, 'utf8');
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

        // 保留未导出的表条目（不在本次导出列表中的表）
        for (const line of lines) {
            // 提取表名: "init/table.sql" -> "table"
            const match = line.match(/([^/]+)\.sql$/);
            if (match) {
                const tableName = match[1];
                // 如果该表不在本次导出列表中，保留它
                if (!exportedTableNames.includes(tableName)) {
                    allFiles.push(line);
                    existingCount++;
                }
            }
        }

        // 去重并排序
        allFiles = [...new Set(allFiles)].sort();
    }

    // 生成 seed 文件内容
    const content = `# Seed file for ${seedName}
# Contains ${allFiles.length} table(s)

${allFiles.join('\n')}
`;

    fs.writeFileSync(seedFilePath, content);
    const msg = existingCount > 0
        ? `${seedName}.seed (${sqlFiles.length} 新增, ${existingCount} 保留, 共 ${allFiles.length} 个)`
        : `${seedName}.seed (${allFiles.length} files)`;
    console.log(`\n   📝 更新 seed 清单: ${msg}`);
}

/**
 * 更新主清单引用
 * 将 {seedName}.seed 添加到 init.seed 主清单中（如果存在且不是 init 自身）
 */
function updateMainManifest(seedName) {
    // init.seed 是自身的清单，不需要引用自己
    if (seedName === 'init') {
        return;
    }

    const mainManifestPath = path.join(BACKUPS_DIR, 'init.seed');

    // 如果主清单不存在，跳过
    if (!fs.existsSync(mainManifestPath)) {
        return;
    }

    let seeds = [];
    const content = fs.readFileSync(mainManifestPath, 'utf8');
    seeds = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    // 添加新的 seed 引用
    const seedRef = `${seedName}.seed`;
    if (!seeds.includes(seedRef)) {
        seeds.push(seedRef);

        // 生成新的主清单内容
        const newContent = `# Main seed manifest
# Lists all available seed files
#
# Usage: node scripts/import-data.js <seed-name>
# Example: node scripts/import-data.js ${seedName}

${seeds.join('\n')}
`;

        fs.writeFileSync(mainManifestPath, newContent);
        console.log(`   📝 更新主清单: init.seed`);
    }
}

/**
 * 主函数
 */
async function main() {
    const { seedName, options } = parseArgs();

    if (!seedName) {
        console.log('❌ 错误: 请提供 seed 名称');
        console.log('');
        console.log('用法: node scripts/export-data.js <seed-name> [options]');
        console.log('');
        console.log('选项:');
        console.log('  --tables=<list>       要导出的表，逗号分隔（不加此参数则默认导出全部）');
        console.log('  --exclude=<list>      额外排除的表，逗号分隔');
        console.log('  --use-pgdump          使用 pg_dump（推荐大数据量）');
        console.log('  --schema              同时导出表结构（默认只导出数据）');
        console.log('  --schema-only         只导出表结构');
        console.log('  --data-only           只导出数据（默认行为）');
        console.log('  --where=<condition>   导出条件');
        console.log('  --limit=<n>           限制每表导出行数');
        console.log('');
        console.log('说明:');
        console.log('  默认只导出数据，不导出表结构');
        console.log('  默认排除系统表：_prisma_migrations');
        console.log('  配置按优先级读取 .env.${NODE_ENV}.local > .env.local > .env.${NODE_ENV} > .env');
        console.log('');
        console.log('示例:');
        console.log('  node scripts/export-data.js my-seed                    # 只导出数据');
        console.log('  node scripts/export-data.js my-seed --schema           # 导出结构+数据');
        console.log('  node scripts/export-data.js my-seed --tables=watchlist,position');
        console.log('  node scripts/export-data.js full-backup --exclude=news_flash,cron_run');
        process.exit(1);
    }

    console.log('📤 PostgreSQL 数据导出工具 (按表覆盖模式)');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // 加载配置
    const env = loadEnv();
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('❌ 未找到 DATABASE_URL（.env/.env.local 或环境变量）');
        process.exit(1);
    }

    // 解析连接参数
    let connParams;
    try {
        connParams = parseConnectionString(databaseUrl);
    } catch (error) {
        console.error(`❌ 连接字符串解析失败: ${error.message}`);
        process.exit(1);
    }

    console.log(`🗄️  数据库: ${connParams.database} @ ${connParams.host}`);
    console.log('');

    // 生成目录名（直接使用 seed-name）
    const outputDirName = seedName;
    const outputDir = path.join(BACKUPS_DIR, outputDirName);

    // 确保 backups 目录和输出子目录存在
    if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`📁 创建输出目录: backups/${outputDirName}/`);
        console.log('');
    }

    // 解析表列表
    let tables = [];

    // 构建排除列表：总是包含系统表；用户指定 --exclude 时额外追加
    const excludeList = [...DEFAULT_EXCLUDE_TABLES];

    if (options.exclude !== null) {
        const userExclude = options.exclude.split(',').map(s => s.trim()).filter(Boolean);
        excludeList.push(...userExclude);
    }

    const client = createClient(databaseUrl);

    try {
        console.log(`🔗 连接到 PostgreSQL: ${connParams.host}`);
        await client.$queryRawUnsafe('SELECT 1');
        console.log('✅ 连接成功');
        console.log('');

        // 处理表列表
        if (!options.tables || options.tables === '*') {
            tables = await getAllTables(client);
            console.log(`📋 发现 ${tables.length} 个表`);
        } else {
            tables = options.tables.split(',').map(s => s.trim()).filter(Boolean);
            console.log(`📋 指定表: ${tables.join(', ')}`);
        }

        // 应用排除列表
        const skippedTables = tables.filter(t => excludeList.includes(t));
        tables = tables.filter(t => !excludeList.includes(t));

        console.log(`📋 实际导出: ${tables.length} 个表`);
        if (skippedTables.length > 0) {
            const isUserExclude = !!options.exclude;
            const skipReason = isUserExclude ? '默认 + 用户指定' : '默认排除';
            console.log(`📋 已跳过: ${skippedTables.length} 个表 (${skipReason})`);
            console.log(`   ${skippedTables.slice(0, 5).join(', ')}${skippedTables.length > 5 ? '...' : ''}`);
        }
        console.log('');

    } catch (error) {
        console.error(`❌ 数据库连接失败: ${error.message}`);
        await client.$disconnect();
        process.exit(1);
    }

    // 选择导出方式
    let usePgdump = options.usePgdump;
    if (usePgdump) {
        const hasPgdump = await checkPgdump();
        if (!hasPgdump) {
            console.log('⚠️  pg_dump 不可用，使用 Node.js 方式导出');
            usePgdump = false;
        }
    }

    const exportMode = options.schemaOnly ? '只导出结构' : (options.schema ? '结构+数据' : '只导出数据');
    console.log(`🚀 开始导出 (${usePgdump ? 'pg_dump' : 'Node.js'} 模式 / ${exportMode})`);
    console.log(`   每个表导出为单独 SQL 文件，同名文件将被覆盖`);
    console.log(`   输出目录: backups/${outputDirName}/`);
    console.log('');

    const exportedFiles = [];
    const failedTables = [];
    let totalSize = 0;

    // 逐个表导出
    for (let i = 0; i < tables.length; i++) {
        const tableName = tables[i];
        const progress = `[${i + 1}/${tables.length}]`;

        // 生成文件名：{table-name}.sql（直接覆盖）
        // 格式: backups/{seed-name}/{table-name}.sql
        const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
        const sqlFileName = `${safeTableName}.sql`;
        const sqlFilePath = path.join(outputDir, sqlFileName);
        // seed 文件中记录相对路径（从 backups/ 目录开始）
        const seedFilePath = path.join(outputDirName, sqlFileName);

        try {
            let sqlContent;
            let rowCount = 0;

            if (usePgdump) {
                sqlContent = await exportTableWithPgdump(connParams, tableName, options);
                // 简单估算行数
                rowCount = (sqlContent.match(/INSERT INTO/g) || []).length;
            } else {
                const result = await exportTableWithNode(client, tableName, options);
                sqlContent = result.content;
                rowCount = result.rowCount;
            }

            // 过滤空数据表：纯数据模式且没有数据行时跳过
            if (!options.schemaOnly && !options.schema && rowCount === 0) {
                console.log(`   ${progress} ⏭️  ${tableName.padEnd(30)} (empty, skipped)`);
                continue;
            }

            // 写入文件
            fs.writeFileSync(sqlFilePath, sqlContent);
            const fileSize = fs.statSync(sqlFilePath).size;
            totalSize += fileSize;
            const fileSizeKB = (fileSize / 1024).toFixed(2);

            exportedFiles.push(seedFilePath);

            const rowInfo = options.schemaOnly ? '(schema only)' : `(${rowCount} rows)`;
            console.log(`   ${progress} ✅ ${tableName.padEnd(30)} ${fileSizeKB.padStart(8)} KB ${rowInfo}`);

        } catch (error) {
            failedTables.push({ table: tableName, error: error.message });
            console.log(`   ${progress} ❌ ${tableName.padEnd(30)} ${error.message}`);
        }
    }

    // 更新 seed 清单（传递本次导出的表名列表用于合并）
    updateSeedFile(seedName, exportedFiles, tables);
    updateMainManifest(seedName);

    // 关闭连接
    await client.$disconnect();

    // 输出总结
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('📊 导出完成');
    console.log(`   成功: ${exportedFiles.length}/${tables.length} 个表`);
    console.log(`   失败: ${failedTables.length} 个表`);
    console.log(`   总大小: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`   输出目录: backups/${outputDirName}/`);
    console.log('');

    if (failedTables.length > 0) {
        console.log('❌ 失败的表:');
        failedTables.forEach(({ table, error }) => {
            console.log(`   - ${table}: ${error}`);
        });
        console.log('');
    }

    console.log(`💡 导入命令: node scripts/import-data.js ${seedName}`);
    console.log('');
    console.log('导入时将执行以下文件：');
    exportedFiles.forEach((file, i) => {
        console.log(`   ${i + 1}. ${file}`);
    });

    if (failedTables.length > 0) {
        process.exit(1);
    }
}

// 运行主函数
main().catch(error => {
    console.error(`❌ 脚本执行失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
