package com.liitpos.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import java.io.ByteArrayOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Hebrew is drawn by Android's text shaper and sent as a 1-bit raster.
 * ESC/POS code pages do not cover Hebrew, so the printer only receives dots.
 */
final class ReceiptBitmap {
    private ReceiptBitmap() {}

    static byte[] encode(JSONObject job) throws Exception {
        int width = job.optInt("paperMm", 80) == 58 ? 384 : 576;
        boolean kick = job.optBoolean("kickDrawer", false);
        JSONArray lines = job.optJSONArray("lines");
        if (lines == null) lines = new JSONArray();
        int count = Math.min(lines.length(), 80);
        float pad = 12f;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));
        paint.setColor(Color.BLACK);
        float[] tops = new float[count];
        float y = pad;
        for (int i = 0; i < count; i++) {
            tops[i] = y;
            JSONObject line = lines.optJSONObject(i);
            String text = line == null ? "" : line.optString("text", "");
            if (text.trim().isEmpty()) {
                y += 10f;
                continue;
            }
            paint.setTextSize(textSize(width, line));
            y += paint.getFontSpacing() + 4f;
        }
        int height = Math.max(32, (int) Math.ceil(y + pad));
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        for (int i = 0; i < count; i++) {
            JSONObject line = lines.optJSONObject(i);
            if (line == null) continue;
            String text = clip(line.optString("text", ""));
            if (text.trim().isEmpty()) continue;
            paint.setTextSize(textSize(width, line));
            paint.setFakeBoldText(line.optBoolean("bold", false));
            float baseline = tops[i] - paint.ascent();
            String align = line.optString("align", "right");
            if ("split".equals(align) && text.contains("\t")) {
                int tab = text.indexOf('\t');
                String label = text.substring(0, tab);
                String value = text.substring(tab + 1);
                paint.setTextAlign(Paint.Align.RIGHT);
                canvas.drawText(label, width - pad, baseline, paint);
                paint.setTextAlign(Paint.Align.LEFT);
                canvas.drawText(value, pad, baseline, paint);
            } else if ("center".equals(align)) {
                paint.setTextAlign(Paint.Align.CENTER);
                canvas.drawText(text, width / 2f, baseline, paint);
            } else {
                paint.setTextAlign(Paint.Align.RIGHT);
                canvas.drawText(text, width - pad, baseline, paint);
            }
        }
        byte[] raster = raster(bitmap);
        bitmap.recycle();
        ByteArrayOutputStream out = new ByteArrayOutputStream(raster.length + 16);
        out.write(0x1b);
        out.write(0x40);
        out.write(raster);
        out.write(0x1b);
        out.write(0x64);
        out.write(0x03);
        if (kick) {
            out.write(0x1b);
            out.write(0x70);
            out.write(0x00);
            out.write(0x19);
            out.write(0xfa);
        }
        out.write(0x1d);
        out.write(0x56);
        out.write(0x42);
        out.write(0x00);
        return out.toByteArray();
    }

    private static float textSize(int width, JSONObject line) {
        String size = line == null ? "md" : line.optString("size", "md");
        float scale = width >= 576 ? 1.15f : 1f;
        if ("lg".equals(size)) return 28f * scale;
        if ("sm".equals(size)) return 18f * scale;
        return 22f * scale;
    }

    private static String clip(String text) {
        if (text.length() <= 90) return text;
        return text.substring(0, 89) + "…";
    }

    private static byte[] raster(Bitmap bitmap) throws Exception {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int widthBytes = (width + 7) / 8;
        byte[] data = new byte[widthBytes * height];
        int[] pixels = new int[width];
        for (int y = 0; y < height; y++) {
            bitmap.getPixels(pixels, 0, width, 0, y, width, 1);
            for (int x = 0; x < width; x++) {
                int color = pixels[x];
                int lum = ((color >> 16) & 0xff) + ((color >> 8) & 0xff) + (color & 0xff);
                if (lum < 520) data[y * widthBytes + (x >> 3)] |= (byte) (0x80 >> (x & 7));
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream(data.length + 8);
        out.write(0x1d);
        out.write(0x76);
        out.write(0x30);
        out.write(0x00);
        out.write(widthBytes & 0xff);
        out.write((widthBytes >> 8) & 0xff);
        out.write(height & 0xff);
        out.write((height >> 8) & 0xff);
        out.write(data);
        return out.toByteArray();
    }
}
