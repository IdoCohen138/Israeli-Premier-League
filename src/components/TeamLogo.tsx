
interface TeamLogoProps {
    teamId: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const teamUIDMap: Record<string, string> = {
    "bj": "cEwxSXc30mGjpHERA6YZ",
    "br": "HQFVsgeN6i5lL02ErcWC",
    "bs": "hNurzZ1NV4rTIsLm36vY",
    "et": "aV5MsMvL5cUxw2FGZ9ei",
    "hbs": "yQGLAU1X1wdLYJaUs9mG",
    "hh": "kUoNlc2LBaowsM4EsvO1",
    "hj": "f0MbYhgWEDhqMHDuN6wM",
    "hk": "1jlD8ejl9jizwhrvj09h",
    "hp": "nSZHZZ3KsWLqaJPn6cKN",
    "ht": "E1Um0HTHKxbtfwX0aZeD",
    "ma": "oeEIKdN6KIKgnwgFZvOw",
    "mh": "ZKS8tiett2ckKRglp6Kg",
    "mn": "usx5s2KEmG0hgFewy8XC",
    "mt": "6xIqFlWU7Vd4iI0bR3sI"
};

const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
};

export default function TeamLogo({ teamId, size = 'md', className = '' }: TeamLogoProps) {
    // מצא את הקיצור של הקבוצה לפי ה-UID
    const teamShortName = Object.keys(teamUIDMap).find(key => teamUIDMap[key] === teamId);
    
    if (!teamShortName) {
        // אם לא נמצא לוגו, החזר אייקון ברירת מחדל
        return (
            <div className={`${sizeClasses[size]} bg-gray-200 rounded-full flex items-center justify-center ${className}`}>
                <span className="text-gray-500 text-xs font-bold">?</span>
            </div>
        );
    }

    return (
        <img
            src={`/logos/${teamShortName}.jpg`}
            alt={`לוגו ${teamShortName}`}
            className={`${sizeClasses[size]} object-contain rounded-full ${className}`}
            onError={(e) => {
                // אם התמונה לא נטענה, הצג אייקון ברירת מחדל
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = `${sizeClasses[size]} bg-gray-200 rounded-full flex items-center justify-center ${className}`;
                    fallback.innerHTML = '<span class="text-gray-500 text-xs font-bold">?</span>';
                    parent.appendChild(fallback);
                }
            }}
        />
    );
} 