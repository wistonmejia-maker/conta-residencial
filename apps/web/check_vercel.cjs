const https = require('https');

https.get('https://conta-residencial.vercel.app/invoices', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // find all <script type="module" crossorigin src="/assets/index-XXXX.js"></script>
    const matches = data.match(/<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/);
    if (matches && matches[1]) {
      console.log('Found main script: ' + matches[1]);
      https.get('https://conta-residencial.vercel.app' + matches[1], (res2) => {
        let jsData = '';
        res2.on('data', chunk => jsData += chunk);
        res2.on('end', () => {
          if (jsData.includes('Tendencia de Egresos')) {
            console.log('✅ Dashboard Improvements ARE PRESENT IN PRODUCTION BUNDLE!');
          } else {
            console.log('❌ Dashboard Improvements ARE NOT PRESENT IN BUNDLE! Old version is still live.');
          }
        });
      });
    } else {
      console.log('Could not find main JS bundle script tag.');
    }
  });
});
