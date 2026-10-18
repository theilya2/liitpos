# Liitpos

קופה רושמת בעברית לחנויות, קיוסקים ובתי קפה. מזומן, אשראי וכרטיס מועדון, עבודה גם בלי רשת, ולוח בקרה לבעלים.

המאגר פרטי.

## לוח בקרה (בעלים בלבד)

אין הרשמה ואין כניסה ציבורית. הקופה לא מציגה קישור ללוח. הכתובת היא `https://liitpos.vercel.app/admin`.

ב-Vercel, תחת Environment Variables:

| משתנה | חובה | מה לשים |
| --- | --- | --- |
| `ADMIN_USERNAME` | כן | שם המשתמש של הבעלים |
| `ADMIN_PASSWORD` | כן, אם אין hash | הסיסמה עצמה |
| `ADMIN_PASSWORD_HASH` | במקום הסיסמה, או בנוסף | ראו למטה |
| `DATABASE_URL` | כן | מחרוזת Neon. כבר מחוברת |
| `BETTER_AUTH_URL` | כן | `https://liitpos.vercel.app` בלי סלאש בסוף. זו הכתובת שנכנסת לקישור של הטלפון |

אם `ADMIN_USERNAME` חסר, או שאין לא סיסמה ולא hash, הכניסה נעולה. `BETTER_AUTH_SECRET` לא בשימוש יותר.

אחרי מיזוג, פריסה מחדש מריצה את `migrations/0003_admin_devices.sql`: כל הנתונים בענן עוברים לבעלים אחד, ונפתחות טבלאות לכניסה ולמכשירים.

ליצירת hash (במחשב, לא בקובץ):

```bash
node --input-type=module -e 'import { randomBytes, scryptSync } from "node:crypto"; const salt = randomBytes(16).toString("hex"); const key = scryptSync(process.argv[1], salt, 32).toString("hex"); console.log(`scrypt:${salt}:${key}`)' 'הסיסמה'
```

התוצאה מתחילה ב-`scrypt:`. שמים אותה ב-`ADMIN_PASSWORD_HASH`. אפשר להשאיר גם את `ADMIN_PASSWORD`, או למחוק אותה ולהישאר רק עם ה-hash.

אחרי כניסה ללוח: הקופה מציגה קוד הפעלה, ומאשרים אותו תחת «קופות ממתינות לאישור». ניתוק בלוח מחזיר את הקופה למסך הקוד. קופה שכבר קיבלה רישיון ממשיכה לעבוד איתו.

