const sharp = require('sharp');
const fs = require('fs');

async function testAnimation() {
  // Найдем тестовый GIF или WebP
  const testFiles = [
    './test.gif',
    './test.webp',
    '/tmp/test.gif'
  ];
  
  let testFile = null;
  for (const file of testFiles) {
    if (fs.existsSync(file)) {
      testFile = file;
      break;
    }
  }
  
  if (!testFile) {
    console.log('Создаем тестовый анимированный WebP...');
    // Создаем простую анимацию: 2 кадра 100x100
    const frame1 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    }).png().toBuffer();
    
    const frame2 = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 }
      }
    }).png().toBuffer();
    
    testFile = './test-anim.webp';
    console.log('Тестовый файл создан (статичный, т.к. Sharp не может создать анимацию напрямую)');
    return;
  }
  
  console.log('Тестируем файл:', testFile);
  
  const buffer = fs.readFileSync(testFile);
  const meta1 = await sharp(buffer).metadata();
  console.log('\nБез animated flag:', meta1);
  
  const meta2 = await sharp(buffer, { animated: true, pages: -1 }).metadata();
  console.log('\nС animated flag:', meta2);
  
  // Тест extend
  console.log('\n--- Тест extend ---');
  const extended = await sharp(buffer, { animated: true, pages: -1 })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  
  const extMeta = await sharp(extended, { animated: true, pages: -1 }).metadata();
  console.log('После extend:', extMeta);
  
  // Тест resize
  console.log('\n--- Тест resize ---');
  const resized = await sharp(buffer, { animated: true, pages: -1 })
    .resize(200, 200)
    .toBuffer();
  
  const resizeMeta = await sharp(resized, { animated: true, pages: -1 }).metadata();
  console.log('После resize:', resizeMeta);
  
  // Тест extract
  console.log('\n--- Тест extract ---');
  const extracted = await sharp(buffer, { animated: true, pages: -1 })
    .extract({ left: 10, top: 10, width: 50, height: 50 })
    .toBuffer();
  
  const extractMeta = await sharp(extracted, { animated: true, pages: -1 }).metadata();
  console.log('После extract:', extractMeta);
}

testAnimation().catch(console.error);
