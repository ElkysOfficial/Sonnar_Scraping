import sys

def main():
    if len(sys.argv) != 4:
        print("usage: python tmp_print.py <file> <start> <end>")
        sys.exit(1)
    path, start, end = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    with open(path, encoding="utf-8") as f:
        for i,line in enumerate(f,1):
            if start <= i <= end:
                print(f"{i}: {line.rstrip()}")

if __name__ == "__main__":
    main()
