import sys
import os
import cv2
import numpy as np
from PIL import Image

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def format_mc_storage(blocks):
    sb = blocks // 1728
    rem_sb = blocks % 1728
    stacks = rem_sb // 64
    rem_blocks = rem_sb % 64
    
    dc = blocks / 3456
    sb_float = blocks / 1728
    
    res = f"{sb_float:>6.2f} SB  ({sb:>2} SB + {stacks:>2} stack + {rem_blocks:>2} block)"
    return res

def generate_report():
    img = Image.open("THẤT NGHIỆP.png").convert('RGBA')
    img_arr = np.array(img)

    r, g, b, a = img_arr[:, :, 0], img_arr[:, :, 1], img_arr[:, :, 2], img_arr[:, :, 3]
    black_mask = ((r <= 10) & (g <= 10) & (b <= 10) & (a > 0)).astype(np.uint8) * 255

    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(black_mask, connectivity=8)

    letters_data = [
        # Từ THẤT
        {"word": "THẤT", "char": "T (chữ đầu)", "pixels": 30938, "detail": "Nét chính chữ T (x=324, y=154)"},
        {"word": "THẤT", "char": "H", "pixels": 46494, "detail": "Thân chữ H (x=690, y=154)"},
        {"word": "THẤT", "char": "Ấ", "pixels": 51577, "detail": "Gồm thân A (43.607) + dấu nón ^ (5.024) + dấu sắc ' (2.946)"},
        {"word": "THẤT", "char": "T (chữ cuối)", "pixels": 30938, "detail": "Nét chính chữ T (x=1376, y=154)"},

        # Từ NGHIỆP
        {"word": "NGHIỆP", "char": "N", "pixels": 55170, "detail": "Thân chữ N (x=0, y=770)"},
        {"word": "NGHIỆP", "char": "G", "pixels": 48735, "detail": "Thân chữ G (x=362, y=763)"},
        {"word": "NGHIỆP", "char": "H", "pixels": 46494, "detail": "Thân chữ H (x=782, y=770)"},
        {"word": "NGHIỆP", "char": "I", "pixels": 19500, "detail": "Thân chữ I (x=1168, y=770)"},
        {"word": "NGHIỆP", "char": "Ệ", "pixels": 51116, "detail": "Gồm thân E (43.322) + dấu nón ^ (5.021) + dấu nặng . (2.773)"},
        {"word": "NGHIỆP", "char": "P", "pixels": 40265, "detail": "Thân chữ P (x=1645, y=770)"},
    ]

    total_pixels_all = 0
    print("=" * 95)
    print(" CHI TIẾT SỐ BLOCK VÀ QUY ĐỔI SHULKER BOX (SB) CHO TỪNG CHỮ CÁI ('THẤT NGHIỆP.png')")
    print(" Quyền chuẩn: 1 Stack = 64 blocks | 1 Shulker Box (SB) = 27 Stack = 1,728 blocks")
    print("=" * 95)

    for word_name in ["THẤT", "NGHIỆP"]:
        print(f"\n🔹 TỪ: {word_name}")
        print("-" * 95)
        word_total = 0
        for item in letters_data:
            if item["word"] == word_name:
                px = item["pixels"]
                word_total += px
                total_pixels_all += px
                storage_str = format_mc_storage(px)
                print(f" • Chữ '{item['char']}': {px:>7,} blocks  ==>  {storage_str}")
        print("-" * 95)
        word_storage = format_mc_storage(word_total)
        word_dc = word_total / 3456
        print(f" ➔ TỔNG TỪ '{word_name}': {word_total:,} blocks  ==>  {word_storage}  (~{word_dc:.2f} Double Chests)")

    print("\n" + "=" * 95)
    total_storage = format_mc_storage(total_pixels_all)
    total_dc = total_pixels_all / 3456
    print(f" TỔNG CỘNG CẢ 2 TỪ ('THẤT NGHIỆP'): {total_pixels_all:,} blocks")
    print(f" ==> Quy đổi: {total_storage}  (~{total_dc:.2f} Rương Đôi / Double Chests)")
    print("=" * 95)


if __name__ == "__main__":
    generate_report()

